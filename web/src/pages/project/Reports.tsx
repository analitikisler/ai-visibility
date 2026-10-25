// Reports: the weekly (or monthly) brief as a clean, printable document, plus CSV exports.
// Print / Save as PDF uses window.print() with A4 print styles scoped to this page; the app chrome
// carries data-print="hide" and the brief always prints in the light theme.
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, FileDown, Play, Printer } from 'lucide-react';
import type { Report } from '@shared/types';
import { EmptyNoData, Logo } from '@/components/art';
import { DriverBars } from '@/components/charts';
import { useProject } from '@/components/layout';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  CardHeader,
  DeltaBadge,
  Dot,
  EmptyState,
  ErrorState,
  Page,
  PageHeader,
  SegmentedControl,
  SimulatedBadge,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useCopy,
  useTabParam,
  useToast,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, exportCsvUrl, isWaitingOnBatch, useActiveRun, useReport, useStartRun, type ExportKind } from '@/lib/api';
import { cn } from '@/lib/cn';
import { BRAND_COLOR, OTHER_COLOR } from '@/lib/colors';
import { compact, dateTime, dayLabel, num, pct, position, score, sentimentScore } from '@/lib/format';

const P = copy.pages.reports;
const RC = copy.reports;
const EXPORTS: ExportKind[] = ['responses', 'mentions', 'citations', 'bot_events', 'prompts'];
const PERIODS = ['week', 'month'] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30 };

/** A4 print rules, mounted only while the Reports page is on screen. */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm 12mm 16mm; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #main { padding: 0 !important; }
  [data-report] { border: 0 !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; box-shadow: none !important; }
  [data-report] [data-print="avoid-break"], [data-report] section, [data-report] tr, [data-report] li { break-inside: avoid; }
  [data-report] h2 { break-after: avoid; }
  [data-report] .recharts-responsive-container { width: 100% !important; }
}`;

/** Print in the light theme: drop `.dark` for the print pass and restore it after. */
function usePrintLight() {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains('dark');
      if (wasDark) root.classList.remove('dark');
    };
    const after = () => {
      if (wasDark) root.classList.add('dark');
      wasDark = false;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}

function summaryText(r: Report): string {
  const lines = [`${r.project.name} · ${RC.cover.overline} · ${fmt(RC.cover.range, { from: dayLabel(r.range.from), to: dayLabel(r.range.to, { year: true }) })}`, '', r.headline, ''];
  lines.push(RC.sections.highlights, ...(r.highlights.length ? r.highlights.map((h) => `- ${h}`) : [RC.emptyHighlights]), '');
  lines.push(RC.sections.risks, ...(r.risks.length ? r.risks.map((h) => `- ${h}`) : [RC.emptyRisks]), '');
  if (r.topRecommendations.length) lines.push(RC.sections.actions, ...r.topRecommendations.map((x, i) => `${i + 1}. ${x.title}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------- brief sections

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 font-sans text-[15px] font-semibold text-text-strong">{children}</h2>;
}

function Bullets({ items, empty, tone }: { items: string[]; empty: string; tone: 'win' | 'risk' }) {
  const Icon = tone === 'win' ? CheckCircle2 : AlertTriangle;
  if (!items.length) return <p className="text-[13px] text-text-subtle">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-[14px] leading-[21px] text-text">
          <Icon size={16} strokeWidth={1.75} aria-hidden className={cn('mt-0.5 shrink-0', tone === 'win' ? 'text-success' : 'text-warning')} />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Scorecard({ r }: { r: Report }) {
  const k = r.overview.kpis;
  const hasPos = k.avgPosition.value > 0;
  const tiles = [
    { label: copy.metrics.visibilityScore, value: score(k.visibilityScore.value), unit: copy.metrics.units.score, delta: k.visibilityScore.delta, kind: 'score' as const },
    { label: copy.metrics.shareOfVoice, value: pct(k.shareOfVoice.value, { from100: true }), delta: k.shareOfVoice.delta, kind: 'points' as const },
    { label: copy.metrics.avgPositionShort, value: hasPos ? position(k.avgPosition.value) : '—', delta: hasPos ? k.avgPosition.delta : null, kind: 'position' as const },
    { label: copy.metrics.sentiment, value: score(k.sentiment.value), unit: copy.metrics.units.score, delta: k.sentiment.delta, kind: 'score' as const },
    { label: copy.metrics.mentions, value: compact(k.mentions.value), delta: k.mentions.delta, kind: 'count' as const },
    { label: copy.metrics.citations, value: compact(k.citations.value), delta: k.citations.delta, kind: 'count' as const },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="border-b border-r border-border px-4 py-3 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-last-child(-n+3)]:border-b-0">
          <dt className="eyebrow truncate">{t.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display font-heading text-2xl leading-8 tracking-[-0.012em] text-text-strong tnum">
              {t.value}
              {t.unit && <span className="ml-0.5 text-sm text-text-muted">{t.unit}</span>}
            </span>
            <DeltaBadge delta={t.delta} kind={t.kind} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Leaderboard({ r }: { r: Report }) {
  const { colors } = useProject();
  const C = copy.pages.overview.columns;
  const rows = [...r.overview.leaderboard].sort((a, b) => a.rank - b.rank).slice(0, 8);
  return (
    <Table aria-label={RC.sections.competitors} dense wrapperClassName="rounded-lg border border-border">
      <THead>
        <tr>
          <Th className="w-10">{C.rank}</Th>
          <Th>{C.brand}</Th>
          <Th num>{C.visibility}</Th>
          <Th num>{C.shareOfVoice}</Th>
          <Th num className="hidden sm:table-cell print:table-cell">
            {C.position}
          </Th>
          <Th num className="hidden sm:table-cell print:table-cell">
            {C.sentiment}
          </Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((e) => (
          <Tr key={e.key} highlight={e.isBrand}>
            <Td num muted>
              {e.rank}
            </Td>
            <Td>
              <span className="flex min-w-0 items-center gap-2">
                <Dot color={e.isBrand ? BRAND_COLOR : (colors[e.key] ?? OTHER_COLOR)} />
                <span className={cn('truncate', e.isBrand && 'font-semibold')}>{e.name}</span>
                {e.isBrand && <Badge tone="primary">{copy.app.badges.you}</Badge>}
              </span>
            </Td>
            <Td num>{pct(e.visibility)}</Td>
            <Td num>{pct(e.shareOfVoice)}</Td>
            <Td num className="hidden sm:table-cell print:table-cell">
              {position(e.avgPosition)}
            </Td>
            <Td num className="hidden sm:table-cell print:table-cell">
              {sentimentScore(e.sentiment) ?? '—'}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function Engines({ r }: { r: Report }) {
  const C = copy.pages.overview.columns;
  const list = r.overview.engines.filter((e) => e.responses > 0);
  return (
    <Table aria-label={RC.sections.engines} dense wrapperClassName="rounded-lg border border-border">
      <THead>
        <tr>
          <Th>{C.engine}</Th>
          <Th num>{C.visibility}</Th>
          <Th num>{C.shareOfVoice}</Th>
          <Th num>{C.position}</Th>
          <Th num className="hidden sm:table-cell print:table-cell">
            {C.answers}
          </Th>
        </tr>
      </THead>
      <TBody>
        {list.map((e) => (
          <Tr key={e.engine}>
            <Td>
              <span className="inline-flex items-center gap-2">
                <span className="font-medium">{e.name}</span>
                {e.mode === 'simulated' && <SimulatedBadge tooltip={false} />}
              </span>
            </Td>
            <Td num>{pct(e.visibility)}</Td>
            <Td num>{pct(e.shareOfVoice)}</Td>
            <Td num>{position(e.avgPosition)}</Td>
            <Td num muted className="hidden sm:table-cell print:table-cell">
              {num(e.responses)}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function Brief({ r }: { r: Report }) {
  const { project, colors } = useProject();
  const ov = r.overview;
  const engines = ov.engines.filter((e) => e.responses > 0).sort((a, b) => b.visibility - a.visibility);
  const engineLine =
    engines.length > 1
      ? fmt(RC.subline.engines, {
          engine: engines[0]!.name,
          visibility: pct(engines[0]!.visibility),
          weakEngine: engines[engines.length - 1]!.name,
          weakVisibility: pct(engines[engines.length - 1]!.visibility),
        })
      : null;
  const lost = r.diagnosis.lostPrompts;
  const topOperator = r.crawlers?.byOperator[0];
  const crawlerLine = r.crawlers && topOperator ? fmt(RC.subline.crawlers, { visits: num(r.crawlers.totals.visits.value), operator: topOperator.operator }) : null;
  const simulated = ov.engines.some((e) => e.mode === 'simulated' && e.responses > 0);
  const leaderColor = useMemo(() => {
    const byName = new Map(project.competitors.map((c) => [c.name.toLowerCase(), colors[c.id] ?? OTHER_COLOR]));
    return (name: string) => byName.get(name.toLowerCase()) ?? OTHER_COLOR;
  }, [project.competitors, colors]);
  const range = fmt(RC.cover.range, { from: dayLabel(r.range.from), to: dayLabel(r.range.to, { year: true }) });

  return (
    <article data-report aria-label={RC.cover.overline} className="mx-auto w-full max-w-[920px] rounded-lg border border-border bg-surface px-5 py-7 sm:px-10 sm:py-10">
      {/* cover */}
      <header className="flex flex-col gap-6 border-b border-border pb-7">
        <div className="flex items-center justify-between gap-4">
          <Logo size={20} />
          <span className="font-mono text-xs text-text-subtle tnum">{fmt(P.generated, { time: dateTime(r.generatedAt) })}</span>
        </div>
        <div>
          <p className="eyebrow">{RC.cover.overline}</p>
          <h1 className="mt-2 font-display font-heading text-[40px] leading-[44px] tracking-[-0.012em] text-text-strong">{fmt(RC.cover.title, { brand: r.project.name })}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {range} · <span className="font-mono">{r.project.domain}</span>
          </p>
        </div>
        <div className="max-w-[68ch]">
          <p className="text-lg font-semibold leading-7 text-text">{r.headline}</p>
          {(engineLine || lost.length > 0 || crawlerLine) && (
            <p className="mt-2 text-[14px] leading-[22px] text-text-muted">
              {[engineLine, lost.length ? plural(lost.length, copy.pages.overview.insights.lostPrompts) : null, crawlerLine].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      </header>

      <div className="mt-8 space-y-9">
        <section>
          <H2>{RC.sections.scorecard}</H2>
          <Scorecard r={r} />
        </section>

        <div className="grid gap-8 md:grid-cols-2 print:grid-cols-2">
          <section>
            <H2>{RC.sections.highlights}</H2>
            <Bullets items={r.highlights} empty={RC.emptyHighlights} tone="win" />
          </section>
          <section>
            <H2>{RC.sections.risks}</H2>
            <Bullets items={r.risks} empty={RC.emptyRisks} tone="risk" />
          </section>
        </div>

        <section>
          <H2>{RC.sections.competitors}</H2>
          <Leaderboard r={r} />
        </section>

        {engines.length > 0 && (
          <section>
            <H2>{RC.sections.engines}</H2>
            <Engines r={r} />
          </section>
        )}

        {r.diagnosis.drivers.length > 0 && (
          <section>
            <H2>{RC.sections.drivers}</H2>
            <div className="rounded-lg border border-border px-2 py-3">
              <DriverBars
                brandName={r.project.name}
                leaderColor={leaderColor}
                items={r.diagnosis.drivers.map((d) => ({ id: d.id, name: copy.labels.driver[d.id], score: d.score, leaderScore: d.leaderScore, leaderName: d.leaderName }))}
              />
            </div>
          </section>
        )}

        {lost.length > 0 && (
          <section>
            <H2>{RC.sections.lostPrompts}</H2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {lost.slice(0, 6).map((l) => (
                <li key={l.promptId} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4 print:flex-row">
                  <span className="min-w-0 text-text">{l.text}</span>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-text-muted tnum">
                    <Dot color={leaderColor(l.winner)} size={6} />
                    <span className="font-sans">{l.winner}</span> {pct(l.winnerVisibility)}
                    <span className="text-text-subtle">· {copy.app.badges.you} {pct(l.brandVisibility)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.topRecommendations.length > 0 && (
          <section>
            <H2>{RC.sections.actions}</H2>
            <ol className="space-y-3">
              {r.topRecommendations.map((x, i) => (
                <li key={x.key} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-border-strong font-mono text-xs font-medium text-text tnum">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold leading-[21px] text-text">{x.title}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-text-muted">{x.description}</p>
                    <p className="mt-1 text-xs text-text-subtle">
                      {copy.recommendations.impact[x.impact]} · {copy.recommendations.effort[x.effort]} · {copy.recommendations.category[x.category]}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section>
          <H2>{RC.sections.crawlers}</H2>
          {r.crawlers ? (
            <div className="grid gap-4 md:grid-cols-[1fr_1.2fr] print:grid-cols-[1fr_1.2fr]">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
                {(['visits', 'agents', 'pages', 'operators'] as const).map((k) => (
                  <div key={k} className="bg-surface px-4 py-3">
                    <dt className="eyebrow truncate">{copy.pages.crawlers.kpis[k]}</dt>
                    <dd className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className="font-display font-heading text-xl tracking-[-0.012em] text-text-strong tnum">{compact(r.crawlers!.totals[k].value)}</span>
                      <DeltaBadge delta={r.crawlers!.totals[k].delta} kind="count" />
                    </dd>
                  </div>
                ))}
              </dl>
              <ul className="space-y-2 rounded-lg border border-border px-4 py-3">
                {r.crawlers.byOperator.slice(0, 6).map((o) => (
                  <li key={o.operator} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-text">{o.operator}</span>
                    <span className="font-mono text-text tnum">
                      {num(o.visits)} <span className="text-text-subtle">· {pct(o.share)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[13px] text-text-subtle">{P.noCrawlers}</p>
          )}
        </section>

        <footer className="space-y-2 border-t border-border pt-5 text-xs leading-[18px] text-text-subtle">
          <p>
            <span className="font-semibold text-text-muted">{RC.sections.methodology}. </span>
            {fmt(RC.methodology, {
              responses: num(ov.totals.responses),
              prompts: num(ov.totals.prompts),
              engines: engines.length,
              from: dayLabel(r.range.from),
              to: dayLabel(r.range.to, { year: true }),
            })}
          </p>
          {simulated && <p>{RC.simulatedNote}</p>}
          <p>{fmt(RC.footer, { date: dayLabel(r.generatedAt.slice(0, 10), { year: true }) })}</p>
        </footer>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------- page

function ExportCard({ days }: { days: number }) {
  const { projectId } = useProject();
  return (
    <Card data-print="hide" className="mx-auto w-full max-w-[920px]">
      <CardHeader title={P.actions.export} subtitle={fmt(P.exportsBody, { days })} />
      <div className="flex flex-wrap gap-2 p-4">
        {EXPORTS.map((k) => (
          <a key={k} href={exportCsvUrl(projectId, k, { days })} download className={buttonClasses({ size: 'sm' })}>
            <Download size={14} strokeWidth={1.75} aria-hidden />
            {P.exports[k]}
          </a>
        ))}
      </div>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[920px] space-y-6 rounded-lg border border-border bg-surface p-10" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

export default function ReportsPage() {
  const { projectId } = useProject();
  const [period, setPeriod] = useTabParam<Period>('period', PERIODS, 'week');
  const days = PERIOD_DAYS[period];
  const q = useReport(projectId, { days });
  const toast = useToast();
  const { copy: copyText } = useCopy();
  const start = useStartRun(projectId);
  const { run } = useActiveRun(projectId);
  usePrintLight();
  const r = q.data;
  const empty = r && r.overview.totals.responses === 0;

  const print = useCallback(() => window.print(), []);

  return (
    <Page>
      <style>{PRINT_CSS}</style>
      <div data-print="hide">
        <PageHeader
          title={P.title}
          subtitle={P.subtitle}
          className="mb-0"
          actions={
            <>
              <SegmentedControl<Period>
                label={P.period.label}
                size="md"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: 'week', label: P.period.week },
                  { value: 'month', label: P.period.month },
                ]}
              />
              <Button
                icon={ClipboardCopy}
                disabled={!r || empty}
                onClick={() => r && void copyText(summaryText(r)).then(() => toast.success(P.copied))}
              >
                {P.actions.copySummary}
              </Button>
              <Button variant="primary" icon={Printer} disabled={!r || empty} onClick={print}>
                {P.printLabel}
              </Button>
            </>
          }
        />
      </div>
      {q.isLoading ? (
        <ReportSkeleton />
      ) : q.isError || !r ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : empty ? (
        <EmptyState
          bordered
          size="lg"
          illustration={<EmptyNoData width={180} />}
          title={P.empty.title}
          body={P.empty.body}
          action={
            <Button
              variant="primary"
              icon={Play}
              loading={(!!run && !isWaitingOnBatch(run)) || start.isPending}
              disabled={isWaitingOnBatch(run)}
              onClick={() => start.mutate({}, { onError: (e) => toast.error(copy.app.runCheck.failed, errorMessage(e)) })}
            >
              {P.empty.cta}
            </Button>
          }
        />
      ) : (
        <div className={cn('space-y-6 transition-opacity duration-160', q.isFetching && 'opacity-60')}>
          <Brief r={r} />
          <p data-print="hide" className="mx-auto flex w-full max-w-[920px] items-center gap-1.5 text-xs text-text-subtle">
            <FileDown size={12} strokeWidth={1.75} aria-hidden />
            {P.printHint}
          </p>
          <ExportCard days={days} />
        </div>
      )}
    </Page>
  );
}
