// Prompts: every tracked question with brand visibility (overall, trend, per engine), position and
// who wins it. Tier tabs + a "Lost" view, search, sort, add (single or bulk), inline tier/topic edits,
// pause/resume, delete. Click a row for the latest answer from each engine.
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle2, ClipboardPaste, Equal, MessagesSquare, MoreHorizontal, Pause, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react';
import type { Competitor, EngineId, EngineInfo, Prompt, PromptStat, PromptTier } from '@shared/types';
import { EmptyPrompts } from '@/components/art';
import { AnswerCard, useAnswerEntities } from '@/components/answers';
import { Sparkline } from '@/components/charts';
import { useProject } from '@/components/layout';
import { HEAT_STEPS, PromptDialog, TierLabel, TIERS } from '@/components/prompts';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Dot,
  Drawer,
  EmptyState,
  EngineBadge,
  EngineMark,
  ErrorState,
  IconButton,
  InfoTip,
  Input,
  Menu,
  ProgressBar,
  Skeleton,
  SkeletonCard,
  Switch,
  Table,
  TableEmpty,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr,
  useSort,
  useTabParam,
  useToast,
  Page,
  PageHeader,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, usePromptStats, useResponses, useUpdatePrompt, useDeletePrompt } from '@/lib/api';
import { cn } from '@/lib/cn';
import { heatStep, OTHER_COLOR } from '@/lib/colors';
import { ENGINES } from '@/lib/engines';
import { useFilterSearch, useFilters } from '@/lib/filters';
import { num, pct, position, relativeTime } from '@/lib/format';

const P = copy.pages.prompts;
const COLS = P.columns;
const TABS = ['all', 'must_win', 'core', 'foundational', 'lost'] as const;
type Tab = (typeof TABS)[number];

/** Case-insensitive whole-word matcher for a competitor's name and aliases (mirrors the server's Diagnose rule). */
function nameMatcher(c: Competitor): RegExp | null {
  const names = [c.name, ...c.aliases].map((n) => n.trim()).filter((n) => n.length >= 2);
  if (!names.length) return null;
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * Lost = named in 15% of answers or fewer while a competitor is named in 40% or more — the same rule as
 * Diagnose and Reports. A competitor named in the prompt itself ("X vs Y") trivially appears, so it can't win it.
 * Returns the winner, or null when the prompt isn't lost.
 */
function useLostWinner() {
  const { project } = useProject();
  return useMemo(() => {
    const matchers = project.competitors.map((c) => ({ c, re: nameMatcher(c) }));
    return (s: PromptStat): { name: string; visibility: number } | null => {
      if (s.responses < 2 || s.visibility > 0.15) return null;
      if (!s.competitorVisibility) return (s.topCompetitor?.visibility ?? 0) >= 0.4 ? s.topCompetitor : null;
      let best: { name: string; visibility: number } | null = null;
      for (const { c, re } of matchers) {
        if (re?.test(s.prompt.text)) continue;
        const v = s.competitorVisibility[c.id] ?? 0;
        if (!best || v > best.visibility) best = { name: c.name, visibility: v };
      }
      return best && best.visibility >= 0.4 ? best : null;
    };
  }, [project.competitors]);
}

/** Heat-ramp label ink (BRAND §7.2): light → white on 6–7; dark → canvas ink on 5–7. */
function inkFor(step: number) {
  if (step >= 6) return 'text-white dark:text-bg';
  if (step === 5) return 'text-text dark:text-bg';
  return 'text-text';
}

function EngineCell({ stat, engine }: { stat: PromptStat; engine: EngineInfo }) {
  const e = stat.byEngine[engine.id];
  const has = !!e && e.responses > 0;
  const step = has ? heatStep(e.visibility) : 0;
  const text = has ? pct(e.visibility) : '—';
  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-medium">{engine.name}</span>
          {has ? (
            <span className="block text-text-muted">
              {copy.metrics.visibility} <span className="font-mono text-text">{text}</span> · {copy.metrics.avgPositionShort}{' '}
              <span className="font-mono text-text">{position(e.position)}</span> · {plural(e.responses, { one: '1 answer', other: '{count} answers' })}
            </span>
          ) : (
            <span className="block text-text-muted">{P.status.noData}</span>
          )}
        </span>
      }
      triggerClassName="w-full"
    >
      <span
        role="img"
        aria-label={`${engine.name}: ${text}`}
        className={cn('flex h-7 w-full min-w-12 items-center justify-center rounded-sm font-mono text-xs tnum', has ? inkFor(step) : 'text-text-subtle')}
        style={{ background: HEAT_STEPS[step] }}
      >
        {text}
      </span>
    </Tooltip>
  );
}

/** Tier chip that opens a menu to change it in place. */
function TierMenu({ prompt }: { prompt: Prompt }) {
  const { projectId } = useProject();
  const update = useUpdatePrompt(projectId);
  const toast = useToast();
  const set = (tier: PromptTier) =>
    tier !== prompt.tier && update.mutate({ id: prompt.id, tier }, { onError: (e) => toast.error(copy.app.errors.saveFailed, errorMessage(e)) });
  return (
    <Menu
      label={P.changeTier}
      items={TIERS.map((t) => ({ key: t, label: <TierLabel tier={t} />, selected: t === prompt.tier, onSelect: () => set(t) }))}
      trigger={(p) => (
        <button
          {...p}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            p.onClick();
          }}
          aria-label={`${P.changeTier}: ${copy.labels.tier[prompt.tier]}`}
          className="inline-flex h-6 items-center rounded-sm border border-transparent px-1 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <TierLabel tier={prompt.tier} />
        </button>
      )}
    />
  );
}

/** Click-to-edit topic. Enter saves, Esc cancels, blur saves. */
function TopicEditor({ prompt }: { prompt: Prompt }) {
  const { projectId } = useProject();
  const update = useUpdatePrompt(projectId);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(prompt.topic);
  const cancelled = useRef(false);
  const save = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const v = value.trim();
    if (v === prompt.topic) return;
    update.mutate(
      { id: prompt.id, topic: v },
      {
        onError: (e) => {
          toast.error(copy.app.errors.saveFailed, errorMessage(e));
          setValue(prompt.topic);
        },
      },
    );
  };
  if (editing)
    return (
      <input
        autoFocus
        value={value}
        maxLength={80}
        aria-label={P.editTopic}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            setValue(prompt.topic);
            e.currentTarget.blur();
          }
        }}
        className="h-6 w-40 rounded-sm border border-primary bg-surface px-1.5 text-xs text-text"
      />
    );
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setValue(prompt.topic);
        setEditing(true);
      }}
      title={P.editTopic}
      className={cn('max-w-48 truncate rounded-sm text-xs hover:text-text hover:underline', prompt.topic ? 'text-text-muted' : 'italic text-text-subtle')}
    >
      {prompt.topic || P.addTopic}
    </button>
  );
}

function RowMenu({ stat, onEdit, onDelete, onOpen }: { stat: PromptStat; onEdit: () => void; onDelete: () => void; onOpen: () => void }) {
  const { projectId } = useProject();
  const update = useUpdatePrompt(projectId);
  const toast = useToast();
  const p = stat.prompt;
  const toggle = () =>
    update.mutate(
      { id: p.id, active: !p.active },
      { onSuccess: () => toast.success(p.active ? P.toasts.paused : P.toasts.resumed), onError: (e) => toast.error(copy.app.errors.saveFailed, errorMessage(e)) },
    );
  return (
    <Menu
      align="end"
      label={p.text}
      items={[
        { key: 'view', label: P.actions.viewAnswers, icon: MessagesSquare, onSelect: onOpen },
        { key: 'edit', label: P.actions.edit, icon: Pencil, onSelect: onEdit },
        { key: 'toggle', label: p.active ? P.actions.pause : P.actions.resume, icon: p.active ? Pause : Play, onSelect: toggle },
        'separator',
        { key: 'delete', label: P.actions.delete, icon: Trash2, danger: true, onSelect: onDelete },
      ]}
      trigger={(t) => (
        <IconButton
          {...t}
          icon={MoreHorizontal}
          label={`${P.rowMenu}: ${p.text}`}
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            t.onClick();
          }}
        />
      )}
    />
  );
}

/** The most-named competitor on a prompt: exact from `competitorVisibility` when present, else the server's pick. */
function topRival(stat: PromptStat, competitors: Competitor[]): { name: string; id?: string; visibility: number } | null {
  if (stat.competitorVisibility) {
    let best: { name: string; id: string; visibility: number } | null = null;
    for (const c of competitors) {
      const v = stat.competitorVisibility[c.id] ?? 0;
      if (v > 0 && (!best || v > best.visibility)) best = { name: c.name, id: c.id, visibility: v };
    }
    return best;
  }
  const top = stat.topCompetitor;
  return top && top.visibility > 0 ? { ...top, id: competitors.find((c) => c.name === top.name)?.id } : null;
}

/** Visibilities are rounded server-side; treat sub-0.05-point differences as equal. */
const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;

function TopCompetitorCell({ stat }: { stat: PromptStat }) {
  const { project, colors } = useProject();
  if (!stat.responses) return <span className="text-text-subtle">—</span>;
  const top = topRival(stat, project.competitors);
  if (!top)
    return stat.visibility > 0 ? (
      <span className="inline-flex items-center gap-1.5 text-text-muted">
        <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden className="text-success" />
        {P.status.winning}
      </span>
    ) : (
      <span className="text-text-subtle">{P.status.notMentioned}</span>
    );
  if (same(stat.visibility, top.visibility))
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-text-muted" title={fmt(P.tiedTooltip, { name: top.name })}>
        <Equal size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className="truncate">{fmt(P.tied, { name: top.name })}</span>
      </span>
    );
  if (stat.visibility > top.visibility)
    return (
      <span className="inline-flex items-center gap-1.5 text-text-muted">
        <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden className="text-success" />
        {P.status.winning}
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Dot color={(top.id && colors[top.id]) || OTHER_COLOR} />
      <span className="truncate">{top.name}</span>
      <span className="font-mono text-text-subtle tnum">{pct(top.visibility)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------- drawer

function EngineBars({ stat, engines }: { stat: PromptStat; engines: EngineInfo[] }) {
  return (
    <ul className="space-y-2.5">
      {engines.map((e) => {
        const v = stat.byEngine[e.id];
        return (
          <li key={e.id}>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <EngineBadge engine={e.id} />
              <span className="font-mono text-text tnum">
                {v ? pct(v.visibility) : '—'} <span className="text-text-subtle">· {position(v?.position)}</span>
              </span>
            </div>
            <ProgressBar value={v?.visibility ?? 0} color={ENGINES[e.id].color} size="xs" label={`${e.name} ${copy.metrics.visibility}`} className="mt-1.5" />
          </li>
        );
      })}
    </ul>
  );
}

function LatestAnswers({ promptId, engines }: { promptId: string; engines: EngineInfo[] }) {
  const entities = useAnswerEntities();
  const { projectId } = useProject();
  // One request for the recent answers; each engine shows its newest.
  const recent = useResponses(projectId, { promptId, limit: 60 });
  const [active, setActive] = useState<EngineId | null>(null);
  const latest = useMemo(() => {
    const m = new Map<EngineId, NonNullable<typeof recent.data>['items'][number]>();
    for (const a of recent.data?.items ?? []) if (!m.has(a.engine)) m.set(a.engine, a);
    return m;
  }, [recent.data]);
  const current = active ?? engines.find((e) => latest.has(e.id))?.id ?? engines[0]?.id ?? null;
  // Engines missing from the recent batch get their own lookup.
  const fallback = useResponses(projectId, { promptId, engine: current ?? undefined, limit: 1 }, { enabled: !!current && !!recent.data && !latest.has(current) });
  const answer = current ? (latest.get(current) ?? fallback.data?.items[0]) : undefined;

  if (recent.isLoading) return <Skeleton className="h-48 w-full" />;
  if (recent.isError) return <ErrorState size="sm" error={recent.error} onRetry={() => void recent.refetch()} />;
  return (
    <div>
      <Tabs<EngineId>
        label={P.drawer.latest}
        value={current ?? engines[0]!.id}
        onValueChange={setActive}
        items={engines.map((e) => {
          const a = latest.get(e.id);
          return {
            value: e.id,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <EngineMark engine={e.id} size={14} />
                {e.name}
                {a && (a.brandMentioned ? <CheckCircle2 size={12} strokeWidth={2} aria-label={copy.pages.responses.namedFilter.named} className="text-accent" /> : null)}
              </span>
            ),
          };
        })}
      />
      <div className="pt-4">
        {answer ? (
          <AnswerCard answer={answer} hidePrompt bare entities={entities} />
        ) : fallback.isFetching ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <p className="rounded-md border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-muted">
            {fmt(P.drawer.noAnswer, { engine: engines.find((e) => e.id === current)?.name ?? '' })}
          </p>
        )}
      </div>
    </div>
  );
}

function PromptDrawer({ stat, engines, onClose, onEdit }: { stat: PromptStat | null; engines: EngineInfo[]; onClose: () => void; onEdit: (p: Prompt) => void }) {
  const { projectId } = useProject();
  const filterSearch = useFilterSearch();
  const update = useUpdatePrompt(projectId);
  const toast = useToast();
  const lostWinner = useLostWinner();
  const p = stat?.prompt;
  const lostTo = stat ? lostWinner(stat) : null;
  const answersHref = p ? `/app/p/${projectId}/responses${filterSearch ? `${filterSearch}&` : '?'}prompt=${p.id}` : '#';
  return (
    <Drawer
      open={!!stat}
      onClose={onClose}
      title={p?.text}
      description={p ? `${copy.labels.tier[p.tier]} · ${copy.labels.intent[p.intent]}${p.topic ? ` · ${p.topic}` : ''}` : undefined}
      widthClass="max-w-2xl"
      footer={
        p && (
          <>
            <Button icon={Pencil} onClick={() => onEdit(p)}>
              {P.actions.edit}
            </Button>
            <ButtonLink to={answersHref} variant="primary" icon={MessagesSquare}>
              {P.drawer.viewAll}
            </ButtonLink>
          </>
        )
      }
    >
      {stat && p && (
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="eyebrow">{copy.metrics.visibility}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-display font-heading text-2xl tracking-[-0.012em] text-text-strong tnum">{stat.responses ? pct(stat.visibility) : '—'}</span>
                <Sparkline values={stat.trend} domain={[0, 1]} width={56} height={22} label={`${copy.metrics.visibility} trend`} />
              </div>
            </div>
            <div>
              <div className="eyebrow">{copy.metrics.avgPositionShort}</div>
              <div className="mt-1 font-display font-heading text-2xl tracking-[-0.012em] text-text-strong tnum">{position(stat.avgPosition)}</div>
            </div>
            <div>
              <div className="eyebrow">{copy.metrics.answers}</div>
              <div className="mt-1 font-display font-heading text-2xl tracking-[-0.012em] text-text-strong tnum">{num(stat.responses)}</div>
            </div>
            <div className="min-w-0">
              <div className="eyebrow">{COLS.topCompetitor}</div>
              <div className="mt-2 text-[13px]">
                <TopCompetitorCell stat={stat} />
              </div>
            </div>
          </div>
          {lostTo && (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
              <InfoTip term={copy.glossary.concepts.lostPrompt} className="mt-0.5 text-warning" />
              {fmt(P.status.lost, { name: lostTo.name })}. {P.lostHelp}
            </p>
          )}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-text">{P.detail.byEngine}</h3>
            <EngineBars stat={stat} engines={engines} />
          </section>
          <Switch
            checked={p.active}
            onCheckedChange={(active) =>
              update.mutate(
                { id: p.id, active },
                { onSuccess: () => toast.success(active ? P.toasts.resumed : P.toasts.paused), onError: (e) => toast.error(copy.app.errors.saveFailed, errorMessage(e)) },
              )
            }
            label={P.status.active}
            description={P.trackingHelp}
            className="rounded-md border border-border px-3 py-2.5"
          />
          <section>
            <h3 className="mb-1 text-sm font-semibold text-text">{P.drawer.latest}</h3>
            <LatestAnswers promptId={p.id} engines={engines} />
          </section>
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------- page

function TableSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={fmt(copy.app.loading.page, { page: P.title })}>
      <Skeleton className="h-9 w-full max-w-lg" />
      <SkeletonCard height={420} />
    </div>
  );
}

export default function PromptsPage() {
  const { projectId, engines: projectEngines } = useProject();
  const { params, engine } = useFilters();
  const stats = usePromptStats(projectId, params);
  const remove = useDeletePrompt(projectId);
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useTabParam<Tab>('tab', TABS, 'all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; prompt: Prompt | null; mode: 'single' | 'bulk' }>({ open: false, prompt: null, mode: 'single' });
  const [deleting, setDeleting] = useState<Prompt | null>(null);

  const engines = engine ? projectEngines.filter((e) => e.id === engine) : projectEngines;
  const lostWinner = useLostWinner();
  const isLost = useCallback((s: PromptStat) => lostWinner(s) !== null, [lostWinner]);
  const list = stats.data ?? [];
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: list.length, must_win: 0, core: 0, foundational: 0, lost: 0 };
    for (const s of list) {
      c[s.prompt.tier]++;
      if (isLost(s)) c.lost++;
    }
    return c;
  }, [list, isLost]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      if (tab === 'lost' ? !isLost(s) : tab !== 'all' && s.prompt.tier !== tab) return false;
      if (!q) return true;
      return s.prompt.text.toLowerCase().includes(q) || s.prompt.topic.toLowerCase().includes(q) || copy.labels.intent[s.prompt.intent].toLowerCase().includes(q);
    });
  }, [list, tab, query, isLost]);

  const tierOrder: Record<PromptTier, number> = { must_win: 0, core: 1, foundational: 2 };
  const accessors: Record<string, (s: PromptStat) => number | string | null> = {
    text: (s) => s.prompt.text,
    tier: (s) => tierOrder[s.prompt.tier],
    intent: (s) => copy.labels.intent[s.prompt.intent],
    visibility: (s) => (s.responses ? s.visibility : null),
    position: (s) => s.avgPosition,
    top: (s) => (s.topCompetitor && s.topCompetitor.visibility > s.visibility ? s.topCompetitor.visibility : 0),
    last: (s) => s.lastRunAt,
  };
  for (const e of projectEngines) accessors[`e_${e.id}`] = (s) => s.byEngine[e.id]?.visibility ?? null;
  const { rows, sortProps } = useSort(filtered, accessors, { key: 'tier', dir: 'asc' });

  const openId = sp.get('prompt');
  const openStat = list.find((s) => s.prompt.id === openId) ?? null;
  const openPrompt = (id: string | null) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('prompt', id);
        else next.delete('prompt');
        return next;
      },
      { replace: true },
    );

  const addButton = (
    <>
      <Button icon={ClipboardPaste} onClick={() => setDialog({ open: true, prompt: null, mode: 'bulk' })}>
        {P.actions.addBulk}
      </Button>
      <Button variant="primary" icon={Plus} onClick={() => setDialog({ open: true, prompt: null, mode: 'single' })}>
        {P.actions.add}
      </Button>
    </>
  );

  const colCount = 7 + engines.length;
  let body;
  if (stats.isLoading) body = <TableSkeleton />;
  else if (stats.isError)
    body = <ErrorState bordered title={copy.app.errors.generic.title} error={stats.error} onRetry={() => void stats.refetch()} retrying={stats.isFetching} />;
  else if (list.length === 0)
    body = (
      <EmptyState
        bordered
        size="lg"
        illustration={<EmptyPrompts width={168} />}
        title={P.empty.title}
        body={P.empty.body}
        action={
          <Button variant="primary" icon={Plus} onClick={() => setDialog({ open: true, prompt: null, mode: 'single' })}>
            {P.empty.cta}
          </Button>
        }
        secondaryAction={
          <Button icon={ClipboardPaste} onClick={() => setDialog({ open: true, prompt: null, mode: 'bulk' })}>
            {P.actions.addBulk}
          </Button>
        }
      />
    );
  else
    body = (
      <div className={cn('space-y-3 transition-opacity duration-160', stats.isPlaceholderData && 'opacity-60')}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <Tabs<Tab>
            label={P.title}
            value={tab}
            onValueChange={setTab}
            className="min-w-0 lg:flex-1"
            items={[
              { value: 'all', label: P.tabs.all, count: counts.all },
              ...TIERS.map((t) => ({ value: t, label: copy.labels.tier[t], count: counts[t] })),
              { value: 'lost', label: P.tabs.lost, count: counts.lost },
            ]}
          />
          <Input
            label={P.search}
            hideLabel
            icon={Search}
            type="search"
            className="[&::-webkit-search-cancel-button]:hidden"
            placeholder={P.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            wrapperClassName="w-full lg:w-72"
            trailing={
              query ? (
                <button type="button" aria-label={copy.common.clearFilters} onClick={() => setQuery('')} className="rounded-sm p-0.5 hover:text-text">
                  <X size={14} strokeWidth={1.75} aria-hidden />
                </button>
              ) : undefined
            }
          />
        </div>
        {tab === 'lost' && (
          <p className="flex items-center gap-1.5 text-[13px] text-text-muted">
            <InfoTip term={copy.glossary.concepts.lostPrompt} />
            {P.lostHelp}
          </p>
        )}
        <Card className="overflow-hidden">
          <Table aria-label={P.title} maxHeight="min(70dvh, 760px)">
            <THead>
              <tr>
                <Th {...sortProps('text', 'asc')} className="min-w-[200px] md:min-w-[240px]">
                  {COLS.prompt}
                </Th>
                <Th {...sortProps('tier', 'asc')} className="hidden md:table-cell">
                  {COLS.tier}
                </Th>
                <Th {...sortProps('visibility')} num>
                  {COLS.visibility}
                </Th>
                {engines.map((e) => (
                  <Th key={e.id} {...sortProps(`e_${e.id}`)} className="px-1.5 text-center">
                    <span className="inline-flex items-center gap-1" title={e.name}>
                      <EngineMark engine={e.id} size={12} variant="marker" />
                      {e.name}
                    </span>
                  </Th>
                ))}
                <Th {...sortProps('position', 'asc')} num title={COLS.position}>
                  {P.positionShort}
                </Th>
                <Th {...sortProps('top')}>{COLS.topCompetitor}</Th>
                <Th {...sortProps('last')} className="hidden 2xl:table-cell">
                  {COLS.lastChecked}
                </Th>
                <Th className="w-8 px-1">
                  <span className="sr-only">{copy.common.edit}</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={colCount}>
                  <span className="block font-medium text-text">{P.filteredEmpty.title}</span>
                  <span className="mt-1 block">{P.filteredEmpty.body}</span>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setQuery('');
                      setTab('all');
                    }}
                  >
                    {P.filteredEmpty.cta}
                  </Button>
                </TableEmpty>
              ) : (
                rows.map((s) => {
                  const p = s.prompt;
                  return (
                    <Tr key={p.id} interactive selected={p.id === openId} onClick={() => openPrompt(p.id)} className={cn(!p.active && 'opacity-60')}>
                      <Td className="py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPrompt(p.id);
                          }}
                          className="line-clamp-2 text-left font-medium text-text hover:text-accent"
                        >
                          {p.text}
                        </button>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-subtle">
                          <span className="md:hidden">
                            <TierLabel tier={p.tier} />
                          </span>
                          <span aria-hidden className="md:hidden">
                            ·
                          </span>
                          <TopicEditor prompt={p} />
                          <span aria-hidden>·</span>
                          <span>{copy.labels.intent[p.intent]}</span>
                          {!p.active && <Badge icon={Pause}>{P.status.paused}</Badge>}
                          {isLost(s) && tab !== 'lost' && <Badge tone="warning">{P.tabs.lost}</Badge>}
                        </span>
                      </Td>
                      {/* Menus render in a portal, but React still bubbles their clicks to the row: stop them here. */}
                      <Td className="hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                        <TierMenu prompt={p} />
                      </Td>
                      <Td num>
                        <span className="inline-flex items-center justify-end gap-2">
                          <Sparkline values={s.trend} domain={[0, 1]} width={48} height={20} className="hidden sm:block" />
                          <span className="w-10">{s.responses ? pct(s.visibility) : '—'}</span>
                        </span>
                      </Td>
                      {engines.map((e) => (
                        <Td key={e.id} className="px-1.5">
                          <EngineCell stat={s} engine={e} />
                        </Td>
                      ))}
                      <Td num>{position(s.avgPosition)}</Td>
                      <Td className="max-w-48">
                        <TopCompetitorCell stat={s} />
                      </Td>
                      <Td muted className="hidden whitespace-nowrap 2xl:table-cell">
                        {s.lastRunAt ? relativeTime(s.lastRunAt) : P.status.noData}
                      </Td>
                      <Td className="px-1 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          stat={s}
                          onOpen={() => openPrompt(p.id)}
                          onEdit={() => setDialog({ open: true, prompt: p, mode: 'single' })}
                          onDelete={() => setDeleting(p)}
                        />
                      </Td>
                    </Tr>
                  );
                })
              )}
            </TBody>
          </Table>
        </Card>
        <p className="text-xs text-text-subtle">
          {plural(rows.length, P.count)}
          {rows.length !== list.length && ` ${copy.common.of} ${list.length}`} · {fmt(copy.filters.range.lastDays, { days: params.days })}
          {engine && ` · ${ENGINES[engine].name}`}
        </p>
      </div>
    );

  return (
    <Page>
      <PageHeader title={P.title} subtitle={P.subtitle} actions={list.length > 0 || stats.isLoading ? addButton : undefined} className="mb-0" />
      {body}

      <PromptDialog open={dialog.open} prompt={dialog.prompt} initialMode={dialog.mode} onClose={() => setDialog((d) => ({ ...d, open: false }))} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={P.deleteDialog.title}
        body={
          <>
            <span className="mb-1 block font-medium text-text">“{deleting?.text}”</span>
            {P.deleteDialog.body}
          </>
        }
        confirmLabel={P.deleteDialog.confirm}
        cancelLabel={P.deleteDialog.cancel}
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(P.toasts.deleted);
              if (openId === deleting.id) openPrompt(null);
              setDeleting(null);
            },
            onError: (e) => toast.error(fmt(copy.app.errors.deleteFailed, { name: P.columns.prompt.toLowerCase() }), errorMessage(e)),
          })
        }
      />
      <PromptDrawer
        stat={openStat}
        engines={projectEngines}
        onClose={() => openPrompt(null)}
        onEdit={(p) => setDialog({ open: true, prompt: p, mode: 'single' })}
      />
    </Page>
  );
}
