// Competitors: full leaderboard, visibility and share-of-voice over time, head to head (per engine +
// the prompts each side wins), and competitor management (add / edit / remove).
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus, MoreHorizontal, Pencil, Plus, ThumbsDown, ThumbsUp, Trash2, Users } from 'lucide-react';
import type { Competitor, EngineId, EntityStat, Overview, PromptStat, SentimentLabel } from '@shared/types';
import { StackedAreaChart, TrendChart, type SeriesDef } from '@/components/charts';
import { useCompetitorDialogs } from '@/components/competitors';
import { useProject } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Dot,
  EmptyState,
  EngineBadge,
  ErrorState,
  IconButton,
  InfoTip,
  Menu,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useSort,
} from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { api, qk, useOverview, usePromptStats } from '@/lib/api';
import { cn } from '@/lib/cn';
import { BRAND_COLOR, OTHER_COLOR, SENTIMENT_COLORS } from '@/lib/colors';
import { useFilterSearch, useFilters } from '@/lib/filters';
import { num, pct, points, position, sentimentScore } from '@/lib/format';

const C = copy.pages.competitors;
const G = copy.glossary.metrics;
const MAX_SERIES = 7;

function SentimentCell({ raw }: { raw: number | null }) {
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

/** "12 pts ahead of you" / "behind you" / "Level with you" — neutral ink with an arrow, never color alone. */
function GapCell({ e, brand }: { e: EntityStat; brand: EntityStat | undefined }) {
  if (e.isBrand || !brand) return <span className="text-text-subtle">—</span>;
  const d = Math.round((e.visibility - brand.visibility) * 100);
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  const text = d === 0 ? C.gap.even : fmt(d > 0 ? C.gap.ahead : C.gap.behind, { delta: points(d) });
  return (
    <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap text-text-muted">
      <Icon size={12} strokeWidth={2} aria-hidden />
      {text}
    </span>
  );
}

function Leaderboard({ ov, onEdit, onRemove }: { ov: Overview; onEdit: (c: Competitor) => void; onRemove: (c: Competitor) => void }) {
  const { project, colors } = useProject();
  const cols = C.columns;
  const byId = new Map(project.competitors.map((c) => [c.id, c]));
  const brand = ov.leaderboard.find((e) => e.isBrand);
  const top = Math.max(...ov.leaderboard.map((e) => e.visibility), 0.01);
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
      gap: (e) => (e.isBrand ? null : e.visibility - (brand?.visibility ?? 0)),
    },
    { key: 'rank', dir: 'asc' },
  );
  return (
    <Card>
      <CardHeader title={C.sections.leaderboard} subtitle={fmt(copy.filters.range.lastDays, { days: ov.range.days })} />
      <div className="mt-3">
        <Table aria-label={C.sections.leaderboard}>
          <THead>
            <tr>
              <Th {...sortProps('rank', 'asc')} className="w-12">
                {cols.rank}
              </Th>
              <Th {...sortProps('name', 'asc')}>{cols.name}</Th>
              <Th className="hidden lg:table-cell">{cols.domain}</Th>
              <Th num {...sortProps('visibility')}>
                {cols.visibility}
              </Th>
              <Th num {...sortProps('sov')}>
                {cols.shareOfVoice}
              </Th>
              <Th num {...sortProps('position', 'asc')}>
                {cols.position}
              </Th>
              <Th num {...sortProps('sentiment')} className="hidden md:table-cell">
                {cols.sentiment}
              </Th>
              <Th num {...sortProps('mentions')} className="hidden xl:table-cell">
                {cols.mentions}
              </Th>
              <Th num {...sortProps('gap')} className="hidden sm:table-cell">
                {cols.gap}
              </Th>
              <Th className="w-10 px-1">
                <span className="sr-only">{copy.common.edit}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((e) => {
              const comp = byId.get(e.key);
              const color = e.isBrand ? BRAND_COLOR : (colors[e.key] ?? OTHER_COLOR);
              return (
                <Tr key={e.key} highlight={e.isBrand}>
                  <Td num muted>
                    {e.rank}
                  </Td>
                  <Td>
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot color={color} />
                      <span className={cn('truncate', e.isBrand && 'font-semibold')}>{e.name}</span>
                      {e.isBrand && <Badge tone="primary">{copy.app.badges.you}</Badge>}
                    </span>
                  </Td>
                  <Td muted className="hidden font-mono text-xs lg:table-cell">
                    {e.isBrand ? project.domain : comp?.domain || '—'}
                  </Td>
                  <Td num>
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-20 overflow-hidden rounded-xs bg-well md:block" aria-hidden>
                        <span className="block h-full" style={{ width: `${(e.visibility / top) * 100}%`, background: color }} />
                      </span>
                      {pct(e.visibility)}
                    </span>
                  </Td>
                  <Td num>{pct(e.shareOfVoice)}</Td>
                  <Td num>{position(e.avgPosition)}</Td>
                  <Td num className="hidden md:table-cell">
                    <SentimentCell raw={e.sentiment} />
                  </Td>
                  <Td num className="hidden xl:table-cell">
                    {num(e.mentions)}
                  </Td>
                  <Td className="hidden text-right sm:table-cell">
                    <GapCell e={e} brand={brand} />
                  </Td>
                  <Td className="px-1 text-right">
                    {comp && (
                      <Menu
                        align="end"
                        label={comp.name}
                        items={[
                          { key: 'edit', label: C.actions.edit, icon: Pencil, onSelect: () => onEdit(comp) },
                          { key: 'remove', label: C.actions.remove, icon: Trash2, danger: true, onSelect: () => onRemove(comp) },
                        ]}
                        trigger={(p) => <IconButton {...p} icon={MoreHorizontal} size="sm" label={fmt(C.manage.rowMenu, { name: comp.name })} />}
                      />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
      <CardFooter>
        <span>{project.competitors.length > MAX_SERIES ? C.otherNote : C.colorNote}</span>
      </CardFooter>
    </Card>
  );
}

type Smoothing = 'daily' | 'rolling';

function TrendCards({ ov }: { ov: Overview }) {
  const { project, colors } = useProject();
  const [smoothingPref, setSmoothing] = useState<Smoothing>('rolling');
  // A 7-day average over a 7-day window is just a running mean: show daily values instead.
  const canSmooth = ov.range.days > 7;
  const smoothing: Smoothing = canSmooth ? smoothingPref : 'daily';
  const series = useMemo<SeriesDef[]>(
    () => [
      { key: 'brand', name: project.name, color: BRAND_COLOR, emphasis: true },
      ...project.competitors.slice(0, MAX_SERIES).map((c) => ({ key: c.id, name: c.name, color: colors[c.id] ?? OTHER_COLOR })),
    ],
    [project, colors],
  );
  const O = copy.pages.overview;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader
          title={C.sections.visibilityTrend}
          titleAddon={<InfoTip term={G.visibilityScore} />}
          subtitle={fmt(copy.filters.range.lastDays, { days: ov.range.days })}
          actions={
            canSmooth && (
              <SegmentedControl<Smoothing>
                label={O.smoothing.label}
                value={smoothing}
                onChange={setSmoothing}
                options={[
                  { value: 'daily', label: O.smoothing.daily },
                  { value: 'rolling', label: O.smoothing.rolling },
                ]}
              />
            )
          }
        />
        <div className="px-4 pb-4 pt-3">
          <TrendChart
            data={ov.visibilityTrend}
            series={series}
            format="percent"
            legend="toggle"
            height={260}
            rollingAvg={smoothing === 'rolling' ? 7 : undefined}
            ariaLabel={`${C.sections.visibilityTrend}: ${project.name} and competitors`}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title={O.sections.sovTrend} titleAddon={<InfoTip term={G.shareOfVoice} />} subtitle={C.sovBody} />
        <div className="px-4 pb-4 pt-3">
          {/* sovTrend rows are already shares of the day's mentions, so the stack reads as 100%. */}
          <StackedAreaChart data={ov.sovTrend} series={series} format="percent" height={260} ariaLabel={`${O.sections.sovTrend}: ${project.name} and competitors`} />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------- head to head

interface Duel {
  stat: PromptStat;
  you: number;
  them: number;
  /** `them` is only an upper bound (the prompt's top competitor, whom the brand beats). */
  upperBound?: boolean;
}

/**
 * Splits prompts into "they win" / "you win" for one competitor. Exact when the server sends
 * `competitorVisibility`; otherwise it uses the prompt's top competitor, which is only decisive
 * when that competitor is the top one (they lead) or the brand beats the top one (you lead).
 */
function duels(stats: PromptStat[], comp: Competitor): { theyWin: Duel[]; youWin: Duel[]; exact: boolean } {
  const theyWin: Duel[] = [];
  const youWin: Duel[] = [];
  let exact = true;
  for (const s of stats) {
    if (!s.responses) continue;
    const you = s.visibility;
    let them = 0;
    let upperBound = false;
    if (s.competitorVisibility) them = s.competitorVisibility[comp.id] ?? 0;
    else {
      exact = false;
      if (!s.topCompetitor) them = 0;
      else if (s.topCompetitor.name === comp.name) them = s.topCompetitor.visibility;
      else if (you > s.topCompetitor.visibility) {
        // The brand beats the prompt's leader, so it beats this competitor too.
        them = s.topCompetitor.visibility;
        upperBound = true;
      } else continue; // undecidable without per-competitor numbers
    }
    if (them > you) theyWin.push({ stat: s, you, them });
    else if (you > them) youWin.push({ stat: s, you, them, upperBound });
  }
  theyWin.sort((a, b) => b.them - b.you - (a.them - a.you));
  youWin.sort((a, b) => b.you - b.them - (a.you - a.them));
  return { theyWin, youWin, exact };
}

function DuelList({ title, items, color, compName }: { title: string; items: Duel[]; color: string; compName: string }) {
  const { projectId, project } = useProject();
  const filterSearch = useFilterSearch();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  return (
    <section className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        {title}
        <span className="rounded-sm border border-border bg-surface-2 px-1 font-mono text-2xs text-text-subtle tnum">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-text-subtle">{C.headToHead.none}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {shown.map((d) => (
            <li key={d.stat.prompt.id} className="py-2">
              <Link
                to={`/app/p/${projectId}/prompts${filterSearch ? `${filterSearch}&` : '?'}prompt=${d.stat.prompt.id}`}
                className="line-clamp-2 text-[13px] font-medium text-text hover:text-accent"
              >
                {d.stat.prompt.text}
              </Link>
              <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
                <span className="h-1.5 overflow-hidden rounded-xs bg-well" aria-hidden>
                  <span className="block h-full" style={{ width: `${d.you * 100}%`, background: BRAND_COLOR }} />
                </span>
                <span className="font-mono text-text-muted tnum">
                  {project.name} {pct(d.you)}
                </span>
                <span className="h-1.5 overflow-hidden rounded-xs bg-well" aria-hidden>
                  <span className={cn('block h-full', d.upperBound && 'opacity-50')} style={{ width: `${d.them * 100}%`, background: color }} />
                </span>
                <span className="font-mono text-text-muted tnum">
                  {compName} {d.upperBound ? `≤ ${pct(d.them)}` : pct(d.them)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 && (
        <Button variant="ghost" size="sm" className="mt-1" onClick={() => setAll((v) => !v)}>
          {all ? copy.common.showLess : fmt(copy.common.showMore, { count: items.length - 6 })}
        </Button>
      )}
    </section>
  );
}

function HeadToHead({ ov }: { ov: Overview }) {
  const { project, projectId, colors, engines } = useProject();
  const { days } = useFilters();
  const comps = project.competitors;
  const leader = ov.leaderboard.filter((e) => !e.isBrand).sort((a, b) => b.visibility - a.visibility)[0];
  const [pick, setPick] = useState<string>('');
  const compId = comps.some((c) => c.id === pick) ? pick : (leader?.key ?? comps[0]?.id ?? '');
  const comp = comps.find((c) => c.id === compId);
  const color = comp ? (colors[comp.id] ?? OTHER_COLOR) : OTHER_COLOR;

  // Per-engine leaderboards: the same overview the Overview page loads with ?engine=…
  const perEngine = useQueries({
    queries: engines.map((e) => ({
      queryKey: qk.overview(projectId, { days, engine: e.id }),
      queryFn: () => api.getOverview(projectId, { days, engine: e.id }),
    })),
  });
  const stats = usePromptStats(projectId, { days });
  const split = useMemo(() => (comp && stats.data ? duels(stats.data, comp) : null), [comp, stats.data]);

  if (!comp) return null;
  return (
    <Card>
      <CardHeader
        title={C.sections.headToHead}
        subtitle={`${project.name} vs ${comp.name} · ${fmt(copy.filters.range.lastDays, { days })}`}
        actions={
          <Select<string>
            label={C.headToHead.pick}
            hideLabel
            size="sm"
            value={compId}
            onChange={setPick}
            options={comps.map((c) => ({ value: c.id, label: c.name }))}
            wrapperClassName="w-44"
          />
        }
      />
      <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold text-text">{C.headToHead.byEngine}</h3>
          <ul className="space-y-3">
            {engines.map((e, i) => {
              const q = perEngine[i];
              const lb = q?.data?.leaderboard;
              const you = lb?.find((x) => x.isBrand)?.visibility;
              const them = lb?.find((x) => x.key === comp.id)?.visibility;
              return (
                <li key={e.id}>
                  <div className="flex items-center justify-between gap-2">
                    <EngineBadge engine={e.id as EngineId} size="sm" />
                    {q?.isLoading && <Skeleton className="h-3 w-16" />}
                  </div>
                  {q?.data && (
                    <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
                      <span className="h-2 overflow-hidden rounded-xs bg-well" aria-hidden>
                        <span className="block h-full" style={{ width: `${(you ?? 0) * 100}%`, background: BRAND_COLOR }} />
                      </span>
                      <span className="w-28 truncate text-right font-mono text-text tnum">
                        <span className="text-text-muted">{project.name}</span> {pct(you)}
                      </span>
                      <span className="h-2 overflow-hidden rounded-xs bg-well" aria-hidden>
                        <span className="block h-full" style={{ width: `${(them ?? 0) * 100}%`, background: color }} />
                      </span>
                      <span className="w-28 truncate text-right font-mono text-text tnum">
                        <span className="text-text-muted">{comp.name}</span> {pct(them)}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
          {stats.isLoading || !split ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : (
            <>
              <DuelList title={fmt(C.sections.theyWin, { name: comp.name })} items={split.theyWin} color={color} compName={comp.name} />
              <DuelList title={C.sections.youWin} items={split.youWin} color={color} compName={comp.name} />
            </>
          )}
        </div>
      </div>
      {split && !split.exact && (
        <CardFooter>
          <span>{C.headToHead.note}</span>
        </CardFooter>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------- page

export default function CompetitorsPage() {
  const { projectId, project } = useProject();
  const { params } = useFilters();
  const ov = useOverview(projectId, params);
  const dialogs = useCompetitorDialogs();
  const data = ov.data;
  const hasCompetitors = project.competitors.length > 0;

  let body;
  if (!hasCompetitors)
    body = (
      <EmptyState
        bordered
        size="lg"
        icon={Users}
        title={C.empty.title}
        body={C.empty.body}
        action={
          <Button variant="primary" icon={Plus} onClick={dialogs.add}>
            {C.empty.cta}
          </Button>
        }
      />
    );
  else if (ov.isLoading)
    body = (
      <div className="space-y-4" aria-busy="true">
        <SkeletonCard height={300} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SkeletonCard height={260} />
          <SkeletonCard height={260} />
        </div>
      </div>
    );
  else if (ov.isError || !data)
    body = <ErrorState bordered title={copy.app.errors.generic.title} error={ov.error} onRetry={() => void ov.refetch()} retrying={ov.isFetching} />;
  else
    body = (
      <div className={cn('space-y-4 transition-opacity duration-160', ov.isPlaceholderData && 'opacity-60')}>
        <Leaderboard ov={data} onEdit={dialogs.edit} onRemove={dialogs.remove} />
        {data.totals.responses > 0 && (
          <>
            <TrendCards ov={data} />
            <HeadToHead ov={data} />
          </>
        )}
      </div>
    );

  return (
    <Page>
      <PageHeader
        title={C.title}
        subtitle={C.subtitle}
        className="mb-0"
        actions={
          hasCompetitors && (
            <Button variant="primary" icon={Plus} onClick={dialogs.add}>
              {C.actions.add}
            </Button>
          )
        }
      />
      {body}
      {dialogs.dialogs}
    </Page>
  );
}
