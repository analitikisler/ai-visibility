// Sources: which sites AI answers cite (yours / competitors' / third-party), per-domain detail with
// sample pages, and the "cited without you" gaps that make the best outreach targets.
import { Fragment, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, ExternalLink, Search, Target, X } from 'lucide-react';
import type { SourceStat, SourceType, SourcesView } from '@shared/types';
import { RunCheckEmpty } from '@/components/answers';
import { DonutChart, type DonutDatum } from '@/components/charts';
import { useProject } from '@/components/layout';
import {
  ButtonLink,
  Card,
  CardHeader,
  Dot,
  EngineMark,
  ErrorState,
  InfoTip,
  Input,
  Page,
  PageHeader,
  SkeletonCard,
  Table,
  TableEmpty,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useSort,
  useTabParam,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { useSources } from '@/lib/api';
import { cn } from '@/lib/cn';
import { SOURCE_TYPE_COLORS } from '@/lib/colors';
import { ENGINE_IDS, ENGINES, isEngineId } from '@/lib/engines';
import { useFilters } from '@/lib/filters';
import { num, pct } from '@/lib/format';


/** Engines in canonical order (ChatGPT, Claude, Gemini…) so the marks line up row to row. */
const sortEngines = <T extends string>(list: T[]) => [...list].sort((a, b) => ENGINE_IDS.indexOf(a as never) - ENGINE_IDS.indexOf(b as never));
const S = copy.pages.sources;
const TYPES: SourceType[] = ['own', 'competitor', 'third_party'];
const TABS = ['all', ...TYPES] as const;
type Tab = (typeof TABS)[number];

/** Gap = a much-cited third-party site whose citing answers rarely name the brand. */
const GAP_RATE = 0.35;
const GAP_POOL = 12;
function gapSources(sources: SourceStat[]): SourceStat[] {
  return sources
    .filter((s) => s.sourceType === 'third_party')
    .sort((a, b) => b.citations - a.citations)
    .slice(0, GAP_POOL)
    .filter((s) => s.brandMentionedRate < GAP_RATE)
    .slice(0, 6);
}

function useTypeColor() {
  const { colors } = useProject();
  return (s: Pick<SourceStat, 'sourceType' | 'competitorId'>) =>
    s.sourceType === 'competitor' && s.competitorId ? (colors[s.competitorId] ?? SOURCE_TYPE_COLORS.competitor) : SOURCE_TYPE_COLORS[s.sourceType];
}

function TypeCard({ view }: { view: SourcesView }) {
  const total = view.totalCitations;
  const data: DonutDatum[] = TYPES.map((t) => ({
    key: t,
    name: copy.labels.sourceType[t],
    value: view.byType[t],
    color: SOURCE_TYPE_COLORS[t],
    emphasis: t === 'own',
  }));
  const share = (t: SourceType) => (total ? view.byType[t] / total : null);
  return (
    <Card className="flex flex-col xl:col-span-2">
      <CardHeader title={S.sections.byType} subtitle={fmt(S.totals, { count: num(total) })} />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <DonutChart
          data={data}
          size={148}
          legend={false}
          center={
            <>
              <span className="font-display font-heading text-xl leading-7 tracking-[-0.012em] text-text-strong tnum">{pct(share('own'))}</span>
              <span className="mt-0.5 text-2xs text-text-subtle">{copy.labels.sourceType.own}</span>
            </>
          }
        />
        <ul className="min-w-0 flex-1 space-y-2.5">
          {TYPES.map((t) => (
            <li key={t} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap text-text-muted">
                <Dot color={SOURCE_TYPE_COLORS[t]} />
                {copy.labels.sourceType[t]}
                <InfoTip term={copy.glossary.sourceTypes[t]} />
              </span>
              <span className="whitespace-nowrap font-mono text-text tnum">
                {pct(share(t))} <span className="text-text-subtle">· {num(view.byType[t])}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-auto border-t border-border px-4 py-3 text-[13px] text-text-muted">
        {fmt(S.insights.thirdParty, { share: pct(share('third_party')) })} {fmt(S.insights.own, { share: pct(share('own')) })}
      </p>
    </Card>
  );
}

function GapCard({ gaps, onPick }: { gaps: SourceStat[]; onPick: (domain: string) => void }) {
  const { projectId } = useProject();
  return (
    <Card className="flex flex-col xl:col-span-3">
      <CardHeader
        title={S.sections.gaps}
        titleAddon={<InfoTip term={copy.glossary.concepts.brandMentionRate} />}
        subtitle={S.sections.gapsBody}
      />
      {gaps.length === 0 ? (
        <p className="m-4 rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-muted">{S.gapsEmpty}</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border px-4">
            {gaps.map((g) => (
              <li key={g.domain} className="flex items-center gap-3 py-2.5">
                <Target size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-warning" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                  <button type="button" onClick={() => onPick(g.domain)} className="min-w-0 truncate text-left font-mono text-[13px] font-medium text-text hover:text-accent sm:flex-1">
                    {g.domain}
                  </button>
                  <span className="flex items-center gap-3 font-mono text-xs tnum">
                    <span className="text-text-muted">
                      {num(g.citations)} {copy.metrics.citations.toLowerCase()}
                    </span>
                    <span className="text-warning sm:w-36 sm:text-right">{fmt(S.gapRate, { rate: pct(g.brandMentionedRate) })}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex justify-end border-t border-border px-4 py-3">
            <ButtonLink to={`/app/p/${projectId}/actions`} size="sm" iconRight={ArrowRight}>
              {S.gapsCta}
            </ButtonLink>
          </div>
        </>
      )}
    </Card>
  );
}

function SampleUrls({ s }: { s: SourceStat }) {
  const { projectId } = useProject();
  return (
    <div className="bg-surface-2 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-4">
        <div className="eyebrow">{S.columns.pages}</div>
        <ButtonLink to={`/app/p/${projectId}/responses?domain=${encodeURIComponent(s.domain)}`} size="sm" variant="ghost" iconRight={ArrowRight}>
          {S.viewAnswers}
        </ButtonLink>
      </div>
      <ul className="space-y-1.5">
        {s.sampleUrls.map((u) => (
          <li key={u.url} className="flex min-w-0 items-center justify-between gap-4 text-[13px]">
            <a href={u.url} target="_blank" rel="noopener noreferrer" className="group inline-flex min-w-0 items-center gap-1.5 text-text hover:text-accent">
              <span className="truncate">{u.title || u.url}</span>
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-subtle group-hover:text-accent" />
              <span className="sr-only">({S.openPage})</span>
            </a>
            <span className="shrink-0 font-mono text-xs text-text-subtle tnum">{plural(u.count, S.pageCount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DomainTable({ view, focus, setFocus }: { view: SourcesView; focus: string | null; setFocus: (d: string | null) => void }) {
  const { project } = useProject();
  const colorOf = useTypeColor();
  const [tab, setTab] = useTabParam<Tab>('type', TABS, 'all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const gaps = useMemo(() => new Set(gapSources(view.sources).map((g) => g.domain)), [view.sources]);
  const compName = (id: string | null) => project.competitors.find((c) => c.id === id)?.name;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return view.sources.filter((s) => (tab === 'all' || s.sourceType === tab) && (!q || s.domain.includes(q) || s.sampleUrls.some((u) => u.title.toLowerCase().includes(q))));
  }, [view.sources, tab, query]);
  const { rows, sortProps } = useSort(
    filtered,
    {
      domain: (s) => s.domain,
      type: (s) => s.sourceType,
      citations: (s) => s.citations,
      share: (s) => s.share,
      answers: (s) => s.responses,
      prompts: (s) => s.prompts,
      engines: (s) => s.engines.length,
      rate: (s) => s.brandMentionedRate,
    },
    { key: 'citations', dir: 'desc' },
  );
  const counts: Record<Tab, number> = { all: view.sources.length, own: 0, competitor: 0, third_party: 0 };
  for (const s of view.sources) counts[s.sourceType]++;
  const topShare = Math.max(...view.sources.map((s) => s.share), 0.01);
  const toggle = (d: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const isOpen = (d: string) => open.has(d) || focus === d;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs<Tab>
          label={S.sections.domains}
          value={tab}
          onValueChange={setTab}
          className="min-w-0 lg:flex-1"
          items={TABS.map((t) => ({ value: t, label: S.tabs[t], count: counts[t] }))}
        />
        <Input
          label={S.search}
          hideLabel
          icon={Search}
          type="search"
          className="[&::-webkit-search-cancel-button]:hidden"
          placeholder={S.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          wrapperClassName="w-full lg:w-64"
          trailing={
            query ? (
              <button type="button" aria-label={copy.common.clearFilters} onClick={() => setQuery('')} className="rounded-sm p-0.5 hover:text-text">
                <X size={14} strokeWidth={1.75} aria-hidden />
              </button>
            ) : undefined
          }
        />
      </div>
      <Card className="overflow-hidden">
        <Table aria-label={S.sections.domains} maxHeight="min(72dvh, 820px)">
          <THead>
            <tr>
              <Th {...sortProps('domain', 'asc')} className="min-w-56">
                {S.columns.domain}
              </Th>
              <Th {...sortProps('type', 'asc')} className="hidden sm:table-cell">
                {S.columns.type}
              </Th>
              <Th num {...sortProps('citations')}>
                {S.columns.citations}
              </Th>
              <Th num {...sortProps('share')} className="hidden md:table-cell">
                {S.columns.share}
              </Th>
              <Th num {...sortProps('answers')} className="hidden lg:table-cell">
                {S.columns.answers}
              </Th>
              <Th num {...sortProps('prompts')} className="hidden lg:table-cell">
                {S.columns.prompts}
              </Th>
              <Th {...sortProps('engines')} className="hidden sm:table-cell">
                {S.columns.engines}
              </Th>
              <Th num {...sortProps('rate')}>
                {S.columns.brandRate}
              </Th>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>{S.filteredEmpty}</TableEmpty>
            ) : (
              rows.map((s) => {
                const expanded = isOpen(s.domain);
                const gap = gaps.has(s.domain);
                return (
                  <Fragment key={s.domain}>
                    <Tr interactive highlight={s.sourceType === 'own'} selected={focus === s.domain} onClick={() => (focus === s.domain ? setFocus(null) : toggle(s.domain))}>
                      <Td>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? S.hidePages : S.showPages}: ${s.domain}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (focus === s.domain) setFocus(null);
                            else toggle(s.domain);
                          }}
                          className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-left"
                        >
                          {expanded ? (
                            <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-subtle" />
                          ) : (
                            <ChevronRight size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-subtle" />
                          )}
                          <Dot color={colorOf(s)} size={6} className="sm:hidden" />
                          <span className="truncate font-mono text-[13px] font-medium text-text">{s.domain}</span>
                        </button>
                      </Td>
                      <Td className="hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-text-muted">
                          <Dot color={colorOf(s)} />
                          {s.sourceType === 'competitor' ? (compName(s.competitorId) ?? copy.labels.sourceType.competitor) : copy.labels.sourceType[s.sourceType]}
                        </span>
                      </Td>
                      <Td num>{num(s.citations)}</Td>
                      <Td num className="hidden md:table-cell">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-16 overflow-hidden rounded-xs bg-well lg:block" aria-hidden>
                            <span className="block h-full" style={{ width: `${(s.share / topShare) * 100}%`, background: colorOf(s) }} />
                          </span>
                          {pct(s.share)}
                        </span>
                      </Td>
                      <Td num className="hidden lg:table-cell">
                        {num(s.responses)}
                      </Td>
                      <Td num className="hidden lg:table-cell">
                        {num(s.prompts)}
                      </Td>
                      <Td className="hidden sm:table-cell">
                        <span className="flex items-center gap-1" aria-label={sortEngines(s.engines).map((e) => (isEngineId(e) ? ENGINES[e].name : e)).join(', ')}>
                          {sortEngines(s.engines).map((e) => (
                            <span key={e} title={isEngineId(e) ? ENGINES[e].name : e}>
                              <EngineMark engine={e} size={14} variant="marker" />
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td num className={cn(gap && 'text-warning')}>
                        <span className="inline-flex items-center justify-end gap-1">
                          {gap && <Target size={12} strokeWidth={2} aria-label={S.sections.gaps} />}
                          {pct(s.brandMentionedRate)}
                        </span>
                      </Td>
                    </Tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8} className="border-b border-border p-0">
                          <SampleUrls s={s} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-text-subtle">
        <Target size={12} strokeWidth={2} aria-hidden className="text-warning" />
        {copy.glossary.concepts.brandMentionRate.short}
        <span className="sr-only">{fmt(S.gapRate, { rate: pct(GAP_RATE) })}</span>
      </p>
    </section>
  );
}

export default function SourcesPage() {
  const { projectId } = useProject();
  const { params } = useFilters();
  const q = useSources(projectId, params);
  const view = q.data;
  const [focus, setFocus] = useState<string | null>(null);
  const [, setTab] = useTabParam<Tab>('type', TABS, 'all');
  const gaps = useMemo(() => (view ? gapSources(view.sources) : []), [view]);
  const pick = (domain: string) => {
    setTab('all');
    setFocus(domain);
    // Bring the domain's row (now expanded) into view.
    window.setTimeout(() => document.querySelector(`[aria-label$=": ${CSS.escape(domain)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  };

  let body;
  if (q.isLoading)
    body = (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <SkeletonCard height={200} className="xl:col-span-2" />
          <SkeletonCard height={200} className="xl:col-span-3" />
        </div>
        <SkeletonCard height={420} />
      </div>
    );
  else if (q.isError || !view) body = <ErrorState bordered title={copy.app.errors.generic.title} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  else if (view.totalCitations === 0) body = <RunCheckEmpty title={S.empty.title} body={S.empty.body} cta={S.empty.cta} />;
  else
    body = (
      <div className={cn('space-y-6 transition-opacity duration-160', q.isPlaceholderData && 'opacity-60')}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <TypeCard view={view} />
          <GapCard gaps={gaps} onPick={pick} />
        </div>
        <DomainTable view={view} focus={focus} setFocus={setFocus} />
      </div>
    );

  return (
    <Page>
      <PageHeader title={S.title} subtitle={S.subtitle} className="mb-0" />
      {body}
    </Page>
  );
}
