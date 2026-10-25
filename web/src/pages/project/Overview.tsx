// Monitor home: KPIs, visibility trend, share of voice, leaderboard, engines, sources, tiers, sentiment.
// This page is the reference for how project pages use the kit — keep it tidy.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Minus, Play, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { EngineStat, EntityStat, Overview, SentimentLabel, SourceType } from '@shared/types';
import { EmptyNoData } from '@/components/art';
import { BarList, DonutChart, TrendChart, type DonutDatum, type SeriesDef } from '@/components/charts';
import { RunProgress, useProject } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  DeltaBadge,
  Dot,
  EngineBadge,
  ErrorState,
  InfoTip,
  KpiCard,
  ModeBadge,
  Page,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  SkeletonCard,
  StatGrid,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useSort,
  useToast,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, isWaitingOnBatch, useActiveRun, useOverview, useStartRun } from '@/lib/api';
import { cn } from '@/lib/cn';
import { BRAND_COLOR, OTHER_COLOR, SENTIMENT_COLORS } from '@/lib/colors';
import { ENGINES } from '@/lib/engines';
import { useFilterSearch, useFilters } from '@/lib/filters';
import { compact, num, pct, plural as pluralCount, points, position, relativeTime, score, sentimentScore, usd } from '@/lib/format';

const O = copy.pages.overview;
const G = copy.glossary.metrics;
const MAX_COMPETITOR_SERIES = 7;

/** Entity color: project map first (stable slots), server value as fallback. */
function useEntityColor() {
  const { colors } = useProject();
  return (e: Pick<EntityStat, 'key' | 'isBrand'>) => (e.isBrand ? BRAND_COLOR : (colors[e.key] ?? OTHER_COLOR));
}

// ---------------------------------------------------------------------------- header + insight

function Insight({ ov }: { ov: Overview }) {
  const brand = ov.leaderboard.find((e) => e.isBrand);
  const leader = ov.leaderboard.find((e) => e.rank === 1);
  if (!brand || !leader) return null;
  const runnerUp = ov.leaderboard.filter((e) => !e.isBrand).sort((a, b) => b.visibility - a.visibility)[0];
  const verdict =
    leader.isBrand && runnerUp
      ? fmt(O.insights.leading, { visibility: pct(brand.visibility), runnerUp: runnerUp.name, runnerUpVisibility: pct(runnerUp.visibility) })
      : fmt(O.insights.behind, { visibility: pct(brand.visibility), leader: leader.name, leaderVisibility: pct(leader.visibility) });
  const engines = ov.engines.filter((e) => e.responses > 0);
  const silent = engines.find((e) => e.visibility === 0);
  const best = [...engines].sort((a, b) => b.visibility - a.visibility);
  const engineLine = silent
    ? fmt(O.insights.notMentioned, { engine: silent.name })
    : best.length > 1
      ? fmt(O.insights.bestEngine, {
          engine: best[0]!.name,
          visibility: pct(best[0]!.visibility),
          weakEngine: best[best.length - 1]!.name,
          weakVisibility: pct(best[best.length - 1]!.visibility),
        })
      : null;
  return (
    <p className="text-sm text-text">
      <span className="font-medium">{verdict}</span> {engineLine && <span className="text-text-muted">{engineLine}</span>}
    </p>
  );
}

function LastCheckLine({ ov }: { ov: Overview }) {
  const run = ov.lastRun;
  const T = O.totals;
  const count = (n: number, forms: { one: string; other: string }) => plural(n, forms, { count: num(n) });
  const totals = [count(ov.totals.responses, T.responses), count(ov.totals.prompts, T.prompts), count(ov.totals.runs, T.runs)].join(' · ');
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-subtle">
      {run && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <Dot
              color={
                run.status === 'failed'
                  ? 'var(--color-danger)'
                  : run.failedJobs > 0
                    ? 'var(--color-warning)'
                    : isWaitingOnBatch(run)
                      ? 'var(--color-text-subtle)'
                      : 'var(--color-success)'
              }
              size={6}
            />
            {fmt(copy.app.runCheck.lastRun, { time: relativeTime(run.finishedAt ?? run.startedAt) })}
          </span>
          <span aria-hidden>·</span>
          <span>{copy.labels.runTrigger[run.trigger]}</span>
          <span aria-hidden>·</span>
          {isWaitingOnBatch(run) ? (
            <>
              <span>{O.lastRunWaiting}</span>
              <span aria-hidden>·</span>
            </>
          ) : (
            typeof run.costUsd === 'number' &&
            run.costUsd > 0 && (
              <>
                <span title={O.lastRunCostTooltip} className="font-mono tnum">
                  {fmt(O.lastRunCost, { cost: usd(run.costUsd) })}
                </span>
                <span aria-hidden>·</span>
              </>
            )
          )}
        </>
      )}
      <span>{totals}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------- KPI row

function KpiRow({ ov, days }: { ov: Overview; days: number }) {
  const k = ov.kpis;
  const brandTrend = (key: 'visibilityTrend' | 'sovTrend') => ov[key].map((p) => (typeof p.brand === 'number' ? p.brand : null));
  const vs = (d: number | null) => (d == null ? copy.filters.noPrior : fmt(copy.filters.vsPrior, { days }));
  const hasPosition = k.avgPosition.value > 0;
  // The API reports a neutral 50 when the brand has no mentions; that's not a measurement, so show "—".
  const hasSentiment = k.mentions.value > 0;
  return (
    <StatGrid>
      <KpiCard
        label={copy.metrics.visibilityScore}
        info={G.visibilityScore}
        value={score(k.visibilityScore.value)}
        unit={copy.metrics.units.score}
        delta={k.visibilityScore.delta}
        deltaKind="score"
        comparison={vs(k.visibilityScore.delta)}
        trend={brandTrend('visibilityTrend')}
      />
      <KpiCard
        label={copy.metrics.shareOfVoice}
        info={G.shareOfVoice}
        value={pct(k.shareOfVoice.value, { from100: true })}
        delta={k.shareOfVoice.delta}
        deltaKind="points"
        comparison={vs(k.shareOfVoice.delta)}
        trend={brandTrend('sovTrend')}
      />
      <KpiCard
        label={copy.metrics.avgPositionShort}
        info={G.avgPosition}
        value={hasPosition ? position(k.avgPosition.value) : '—'}
        delta={hasPosition ? k.avgPosition.delta : null}
        deltaKind="position"
        comparison={hasPosition ? vs(k.avgPosition.delta) : copy.metrics.positionBetter}
      />
      <KpiCard
        label={copy.metrics.sentiment}
        info={G.sentiment}
        value={hasSentiment ? score(k.sentiment.value) : '—'}
        unit={hasSentiment ? copy.metrics.units.score : undefined}
        delta={hasSentiment ? k.sentiment.delta : null}
        deltaKind="score"
        comparison={vs(hasSentiment ? k.sentiment.delta : null)}
      />
      <KpiCard
        label={copy.metrics.mentions}
        info={G.mentions}
        value={compact(k.mentions.value)}
        delta={k.mentions.delta}
        deltaKind="count"
        comparison={vs(k.mentions.delta)}
      />
      <KpiCard
        label={copy.metrics.citations}
        info={G.citations}
        value={compact(k.citations.value)}
        delta={k.citations.delta}
        deltaKind="count"
        comparison={vs(k.citations.delta)}
      />
    </StatGrid>
  );
}

// ---------------------------------------------------------------------------- trend + share

type TrendMode = 'visibility' | 'sov';
type Smoothing = 'daily' | 'rolling';
const ROLLING_DAYS = 7;

function TrendCard({ ov }: { ov: Overview }) {
  const { project } = useProject();
  const colorOf = useEntityColor();
  const [mode, setMode] = useState<TrendMode>('visibility');
  const [smoothingPref, setSmoothing] = useState<Smoothing>('rolling');
  // A 7-day average over a 7-day window is just a running mean of the window: show daily values instead.
  const canSmooth = ov.range.days > ROLLING_DAYS;
  const smoothing: Smoothing = canSmooth ? smoothingPref : 'daily';
  const series = useMemo<SeriesDef[]>(() => {
    const brand: SeriesDef = { key: 'brand', name: project.name, color: BRAND_COLOR, emphasis: true };
    // Competitors in project order (stable colors); beyond 7 they're folded out of the chart.
    const comps = project.competitors.slice(0, MAX_COMPETITOR_SERIES).map((c) => ({ key: c.id, name: c.name, color: colorOf({ key: c.id, isBrand: false }) }));
    return [brand, ...comps];
  }, [project, colorOf]);
  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title={mode === 'visibility' ? O.sections.visibilityTrend : O.sections.sovTrend}
        titleAddon={<InfoTip term={mode === 'visibility' ? G.visibilityScore : G.shareOfVoice} />}
        subtitle={fmt(copy.filters.range.lastDays, { days: ov.range.days })}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {mode === 'visibility' && canSmooth && (
              <SegmentedControl<Smoothing>
                label={O.smoothing.label}
                value={smoothing}
                onChange={setSmoothing}
                options={[
                  { value: 'daily', label: O.smoothing.daily },
                  { value: 'rolling', label: O.smoothing.rolling },
                ]}
              />
            )}
            <SegmentedControl<TrendMode>
              label="Metric"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'visibility', label: copy.metrics.visibility },
                { value: 'sov', label: copy.metrics.shareOfVoice },
              ]}
            />
          </div>
        }
      />
      <div className="px-4 pb-4 pt-3">
        <TrendChart
          data={mode === 'visibility' ? ov.visibilityTrend : ov.sovTrend}
          series={series}
          format="percent"
          legend="toggle"
          height={280}
          rollingAvg={mode === 'visibility' && smoothing === 'rolling' ? ROLLING_DAYS : undefined}
          ariaLabel={`${mode === 'visibility' ? O.sections.visibilityTrend : O.sections.sovTrend}: ${project.name} and competitors`}
        />
      </div>
    </Card>
  );
}

function ShareCard({ ov }: { ov: Overview }) {
  const colorOf = useEntityColor();
  const data = useMemo<DonutDatum[]>(() => {
    const brand = ov.leaderboard.find((e) => e.isBrand);
    const comps = ov.leaderboard.filter((e) => !e.isBrand).sort((a, b) => b.shareOfVoice - a.shareOfVoice);
    const top = comps.slice(0, MAX_COMPETITOR_SERIES);
    const rest = comps.slice(MAX_COMPETITOR_SERIES);
    const out: DonutDatum[] = [];
    if (brand) out.push({ key: 'brand', name: brand.name, value: brand.shareOfVoice, color: BRAND_COLOR, emphasis: true });
    for (const c of top) out.push({ key: c.key, name: c.name, value: c.shareOfVoice, color: colorOf(c) });
    if (rest.length) out.push({ key: 'other', name: 'Other', value: rest.reduce((s, c) => s + c.shareOfVoice, 0), color: OTHER_COLOR });
    return out;
  }, [ov.leaderboard, colorOf]);
  const brand = ov.leaderboard.find((e) => e.isBrand);
  return (
    <Card>
      <CardHeader
        title={copy.metrics.shareOfVoice}
        titleAddon={<InfoTip term={G.shareOfVoice} />}
        subtitle={fmt(copy.filters.range.lastDays, { days: ov.range.days })}
      />
      <div className="p-4">
        <DonutChart
          data={data}
          size={164}
          center={
            <>
              <span className="font-display font-heading text-2xl leading-7 tracking-[-0.012em] text-text-strong tnum">{pct(brand?.shareOfVoice)}</span>
              <span className="mt-0.5 max-w-24 truncate text-2xs text-text-subtle">{brand?.name}</span>
            </>
          }
          className="sm:flex-col sm:items-stretch 2xl:flex-row 2xl:items-center"
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- leaderboard

function Leaderboard({ ov }: { ov: Overview }) {
  const colorOf = useEntityColor();
  const filterSearch = useFilterSearch();
  const { projectId } = useProject();
  const cols = O.columns;
  const { rows, sortProps } = useSort(
    ov.leaderboard,
    {
      rank: (e) => e.rank,
      name: (e) => e.name,
      visibility: (e) => e.visibility,
      sov: (e) => e.shareOfVoice,
      position: (e) => e.avgPosition,
      sentiment: (e) => e.sentiment,
      mentions: (e) => e.mentions,
    },
    { key: 'rank', dir: 'asc' },
  );
  const top = Math.max(...ov.leaderboard.map((e) => e.visibility), 0.01);
  const brand = ov.leaderboard.find((e) => e.isBrand);
  const leader = ov.leaderboard.find((e) => e.rank === 1);
  const gap = brand && leader && !leader.isBrand ? Math.round((leader.visibility - brand.visibility) * 100) : 0;
  return (
    <Card className="flex flex-col xl:col-span-2">
      <CardHeader
        title={O.sections.leaderboard}
        subtitle={copy.pages.competitors.subtitle}
        actions={
          <Link to={`/app/p/${projectId}/competitors${filterSearch}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            {O.viewAll}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
          </Link>
        }
      />
      <div className="mt-3">
        <Table aria-label={O.sections.leaderboard}>
          <THead>
            <tr>
              <Th {...sortProps('rank', 'asc')} className="w-12">
                {cols.rank}
              </Th>
              <Th {...sortProps('name', 'asc')}>{cols.brand}</Th>
              <Th num {...sortProps('visibility')}>
                {cols.visibility}
              </Th>
              <Th num {...sortProps('sov')}>
                {cols.shareOfVoice}
              </Th>
              <Th num {...sortProps('position', 'asc')}>
                {cols.position}
              </Th>
              <Th num {...sortProps('sentiment')}>
                {cols.sentiment}
              </Th>
              <Th num {...sortProps('mentions')} className="hidden 2xl:table-cell">
                {cols.mentions}
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
                    <Dot color={colorOf(e)} />
                    <span className={cn('truncate', e.isBrand && 'font-semibold')}>{e.name}</span>
                    {e.isBrand && <Badge tone="primary">{copy.app.badges.you}</Badge>}
                  </span>
                </Td>
                <Td num>
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-14 overflow-hidden rounded-xs bg-well 2xl:block" aria-hidden>
                      <span className="block h-full" style={{ width: `${(e.visibility / top) * 100}%`, background: colorOf(e) }} />
                    </span>
                    {pct(e.visibility)}
                  </span>
                </Td>
                <Td num>{pct(e.shareOfVoice)}</Td>
                <Td num>{position(e.avgPosition)}</Td>
                <Td num>
                  <SentimentScore raw={e.sentiment} />
                </Td>
                <Td num className="hidden 2xl:table-cell">
                  {num(e.mentions)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      {brand && leader && (
        <CardFooter className="mt-auto">
          <span>
            {copy.metrics.rank} <span className="font-mono text-text tnum">#{brand.rank}</span> of {ov.leaderboard.length}
            {leader.isBrand ? null : (
              <>
                {' · '}
                {leader.name} leads by <span className="font-mono text-text tnum">{points(gap)}</span>
              </>
            )}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}

/** 0..100 sentiment with a label icon (never color alone). */
function SentimentScore({ raw }: { raw: number | null }) {
  const s = sentimentScore(raw);
  if (s == null) return <span className="text-text-subtle">—</span>;
  const label: SentimentLabel = s >= 60 ? 'positive' : s <= 40 ? 'negative' : 'neutral';
  const Icon = label === 'positive' ? ThumbsUp : label === 'negative' ? ThumbsDown : Minus;
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={copy.labels.sentiment[label]}>
      <Icon size={12} strokeWidth={2} aria-hidden style={{ color: SENTIMENT_COLORS[label] }} />
      {s}
      <span className="sr-only">{copy.labels.sentiment[label]}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------- sources

function SourcesCard({ ov }: { ov: Overview }) {
  const { colors, projectId } = useProject();
  const filterSearch = useFilterSearch();
  const colorFor = (type: SourceType, competitorId: string | null) =>
    type === 'own' ? BRAND_COLOR : type === 'competitor' && competitorId ? (colors[competitorId] ?? OTHER_COLOR) : OTHER_COLOR;
  const types: SourceType[] = ['own', 'competitor', 'third_party'];
  return (
    <Card>
      <CardHeader
        title={O.sections.topSources}
        actions={
          <Link to={`/app/p/${projectId}/sources${filterSearch}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            {O.viewAll}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
          </Link>
        }
      />
      <div className="px-2 pb-3 pt-2">
        <BarList
          items={ov.topSources.map((s) => ({
            key: s.domain,
            label: <span className="font-mono text-[12.5px]">{s.domain}</span>,
            title: s.domain,
            value: s.citations,
            display: num(s.citations),
            meta: `${pct(s.share)} · ${copy.labels.sourceType[s.sourceType]}`,
            color: colorFor(s.sourceType, s.competitorId),
            highlight: s.sourceType === 'own',
          }))}
          labelHeader="Domain"
          valueHeader={copy.metrics.citations}
          empty={copy.pages.sources.subtitle}
        />
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-text-muted">
          {types.map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Dot color={t === 'own' ? BRAND_COLOR : t === 'competitor' ? 'var(--color-chart-2)' : OTHER_COLOR} />
              {copy.labels.sourceType[t]}
              <InfoTip term={copy.glossary.sourceTypes[t]} />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- engines / tiers / sentiment

function EnginesCard({ engines }: { engines: EngineStat[] }) {
  const top = Math.max(...engines.map((e) => e.visibility), 0.01);
  return (
    <Card>
      <CardHeader title={O.sections.engines} />
      <ul className="flex flex-col gap-1 p-2 pt-3">
        {engines.map((e) => (
          <li key={e.engine} className="rounded-md px-2 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <EngineBadge engine={e.engine} />
                <ModeBadge mode={e.mode} engineName={e.name} />
              </span>
              <span className="font-mono text-[13px] text-text tnum">{pct(e.visibility)}</span>
            </div>
            <ProgressBar value={e.visibility / top} color={ENGINES[e.engine].color} size="xs" label={`${e.name} ${copy.metrics.visibility}`} className="mt-2" />
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-text-subtle">
              <span>
                {copy.metrics.avgPositionShort} <span className="font-mono text-text-muted tnum">{position(e.avgPosition)}</span>
              </span>
              <span>
                {copy.metrics.shareOfVoice} <span className="font-mono text-text-muted tnum">{pct(e.shareOfVoice)}</span>
              </span>
              <span>
                <span className="font-mono text-text-muted tnum">{num(e.responses)}</span> {copy.metrics.answers.toLowerCase()}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TiersCard({ ov }: { ov: Overview }) {
  return (
    <Card>
      <CardHeader title={O.sections.tiers} />
      <div className="px-2 pb-3 pt-2">
        <BarList
          max={1}
          format="percent"
          items={ov.tiers.map((t) => ({
            key: t.tier,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {copy.labels.tier[t.tier]}
                <InfoTip term={copy.glossary.tiers[t.tier]} />
              </span>
            ),
            value: t.visibility,
            meta: pluralCount(t.prompts, 'prompt'),
            color: BRAND_COLOR,
          }))}
          labelHeader={O.columns.tier}
          valueHeader={copy.metrics.visibility}
        />
      </div>
    </Card>
  );
}

function SentimentCard({ ov }: { ov: Overview }) {
  const b = ov.sentimentBreakdown;
  const total = b.positive + b.neutral + b.negative;
  const order: SentimentLabel[] = ['positive', 'neutral', 'negative'];
  const icons = { positive: ThumbsUp, neutral: Minus, negative: ThumbsDown } as const;
  return (
    <Card>
      <CardHeader title={O.sections.sentiment} titleAddon={<InfoTip term={G.sentiment} />} subtitle={copy.metrics.sentimentScale} />
      <div className="p-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display font-heading text-2xl leading-8 tracking-[-0.012em] text-text-strong tnum">{total > 0 ? score(ov.kpis.sentiment.value) : '—'}</span>
          {total > 0 && <span className="font-mono text-sm text-text-muted">{copy.metrics.units.score}</span>}
          <DeltaBadge delta={total > 0 ? ov.kpis.sentiment.delta : null} kind="score" />
        </div>
        <div className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-xs bg-well" role="img" aria-label={order.map((l) => `${copy.labels.sentiment[l]} ${pct(total ? b[l] / total : null)}`).join(', ')}>
          {total > 0 && order.map((l) => <span key={l} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(b[l] / total) * 100}%`, background: SENTIMENT_COLORS[l] }} />)}
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {order.map((l) => {
            const Icon = icons[l];
            return (
              <li key={l} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="inline-flex items-center gap-2 text-text-muted">
                  <Icon size={14} strokeWidth={2} aria-hidden style={{ color: SENTIMENT_COLORS[l] }} />
                  {copy.labels.sentiment[l]}
                </span>
                <span className="font-mono text-text tnum">
                  {pct(total ? b[l] / total : null)} <span className="text-text-subtle">· {num(b[l])}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- states

function NoAnswers() {
  const { projectId } = useProject();
  const start = useStartRun(projectId);
  const { run } = useActiveRun(projectId);
  const toast = useToast();
  const busy = !!run || start.isPending;
  return (
    <Card>
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <EmptyNoData width={180} />
        <h2 className="mt-6 text-xl font-semibold text-text">{O.empty.title}</h2>
        <p className="mt-1 max-w-md text-sm text-text-muted">{O.empty.body}</p>
        {busy ? (
          <RunProgress run={run} className="mt-6" />
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={Play}
            className="mt-6"
            onClick={() => start.mutate({}, { onError: (e) => toast.error(copy.app.runCheck.failed, errorMessage(e)) })}
          >
            {O.empty.cta}
          </Button>
        )}
      </div>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={fmt(copy.app.loading.page, { page: O.title })}>
      <StatGrid>
        {Array.from({ length: 6 }, (_, i) => (
          <KpiCard key={i} label=" " value="" loading />
        ))}
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SkeletonCard height={280} className="xl:col-span-2" />
        <SkeletonCard height={280} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- page

export default function OverviewPage() {
  const { projectId } = useProject();
  const { params, days } = useFilters();
  const ov = useOverview(projectId, params);
  const data = ov.data;

  return (
    <Page>
      <PageHeader title={O.title} subtitle={O.subtitle} className="mb-0" />

      {ov.isLoading ? (
        <OverviewSkeleton />
      ) : ov.isError || !data ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={ov.error} onRetry={() => void ov.refetch()} retrying={ov.isFetching} />
      ) : data.totals.responses === 0 ? (
        <NoAnswers />
      ) : (
        <div className={cn('space-y-4 transition-opacity duration-160', ov.isPlaceholderData && 'opacity-60')}>
          <div className="flex flex-col gap-1.5">
            <Insight ov={data} />
            <LastCheckLine ov={data} />
          </div>
          <KpiRow ov={data} days={days} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <TrendCard ov={data} />
            <ShareCard ov={data} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Leaderboard ov={data} />
            <SourcesCard ov={data} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <EnginesCard engines={data.engines} />
            <TiersCard ov={data} />
            <SentimentCard ov={data} />
          </div>
        </div>
      )}
    </Page>
  );
}
