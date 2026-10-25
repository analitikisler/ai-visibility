// Plan & Act: recommendations ranked by priority (filters + status tabs), one-click agent drafts that
// open in the review drawer, and the list of every draft. Nothing is published automatically.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  CircleSlash,
  CodeXml,
  FilePen,
  FileText,
  Link2,
  MessageSquareText,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  SignalHigh,
  SignalLow,
  SignalMedium,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Draft, DriverId, RecCategory, RecImpact, Recommendation, RecStatus } from '@shared/types';
import { EmptyActions } from '@/components/art';
import { DRAFT_KINDS, DRAFT_KIND_ICONS, DraftDrawer, DraftKindIcon, DraftModeBadge, DraftStatusBadge, useDraftAgent } from '@/components/drafts';
import { useProject } from '@/components/layout';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Menu,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
  SkeletonCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr,
  Tabs,
  TabPanel,
  useTabParam,
  useToast,
  type MenuItemDef,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, isWaitingOnBatch, useActiveRun, useDrafts, useRecommendations, useStartRun, useUpdateRecommendation } from '@/lib/api';
import { cn } from '@/lib/cn';
import { isEngineId } from '@/lib/engines';
import { relativeTime } from '@/lib/format';

const P = copy.pages.actions;
const R = copy.recommendations;
const D = R.drafts;

const STATUSES: RecStatus[] = ['open', 'in_progress', 'done', 'dismissed'];
const CATEGORIES: RecCategory[] = ['content', 'technical', 'sources', 'reputation', 'crawlers'];
const IMPACTS: RecImpact[] = ['high', 'medium', 'low'];
const DRIVERS: DriverId[] = ['content_coverage', 'content_quality', 'source_authority', 'technical_readiness', 'sentiment'];

const CATEGORY_ICONS: Record<RecCategory, LucideIcon> = { content: FileText, technical: CodeXml, sources: Link2, reputation: MessageSquareText, crawlers: Bot };
const IMPACT_ICONS: Record<RecImpact, LucideIcon> = { high: SignalHigh, medium: SignalMedium, low: SignalLow };
const STATUS_ICONS: Record<RecStatus, { icon: LucideIcon; cls: string }> = {
  open: { icon: Circle, cls: 'text-text-subtle' },
  in_progress: { icon: CircleDot, cls: 'text-info' },
  done: { icon: CheckCircle2, cls: 'text-success' },
  dismissed: { icon: CircleSlash, cls: 'text-text-subtle' },
};

const isQuickWin = (r: Recommendation) => r.impact === 'high' && r.effort === 'low';

/** Latest non-dismissed draft per recommendation key (drafts carry the request params in `meta.params`). */
function draftsByRec(drafts: Draft[] | undefined): Map<string, Draft> {
  const map = new Map<string, Draft>();
  for (const d of drafts ?? []) {
    const key = (d.meta.params as Record<string, string> | undefined)?.recKey;
    if (key && d.status !== 'dismissed' && !map.has(key)) map.set(key, d);
  }
  return map;
}

// ---------------------------------------------------------------------------- recommendation card

function StatusMenu({ rec }: { rec: Recommendation }) {
  const { projectId } = useProject();
  const update = useUpdateRecommendation(projectId);
  const toast = useToast();
  const set = (status: RecStatus) =>
    update.mutate({ key: rec.key, status }, { onError: (e) => toast.error(P.updateFailed, errorMessage(e)) });
  const A = R.statusActions;
  const items: MenuItemDef[] =
    rec.status === 'open'
      ? [
          { key: 'start', label: A.start, icon: Play, onSelect: () => set('in_progress') },
          { key: 'done', label: A.done, icon: CheckCircle2, onSelect: () => set('done') },
          { key: 'dismiss', label: A.dismiss, icon: CircleSlash, onSelect: () => set('dismissed') },
        ]
      : rec.status === 'in_progress'
        ? [
            { key: 'done', label: A.done, icon: CheckCircle2, onSelect: () => set('done') },
            { key: 'reopen', label: A.reopen, icon: RotateCcw, onSelect: () => set('open') },
            { key: 'dismiss', label: A.dismiss, icon: CircleSlash, onSelect: () => set('dismissed') },
          ]
        : [{ key: 'reopen', label: A.reopen, icon: RotateCcw, onSelect: () => set('open') }];
  const S = STATUS_ICONS[rec.status];
  return (
    <Menu
      label={P.statusMenu}
      align="end"
      items={items}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`${P.statusMenu}: ${R.status[rec.status]}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 text-xs font-medium text-text transition-colors hover:bg-surface-2"
        >
          <S.icon size={14} strokeWidth={2} aria-hidden className={S.cls} />
          {R.status[rec.status]}
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
        </button>
      )}
    />
  );
}

function Evidence({ items }: { items: string[] }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <div className="mt-3">
      <h4 className="eyebrow mb-1">{P.card.why}</h4>
      <ul className="space-y-1 text-[13px] leading-5 text-text">
        {shown.map((e, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-xs bg-text-subtle" />
            <span className="min-w-0">{e}</span>
          </li>
        ))}
      </ul>
      {items.length > 3 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 text-xs font-medium text-accent hover:underline">
          {all ? copy.common.showLess : fmt(copy.common.showMore, { count: items.length - 3 })}
        </button>
      )}
    </div>
  );
}

/** Where to act on a recommendation the agent can't draft (audit, tracking, a check, an engine's answers). */
function RecShortcut({ rec }: { rec: Recommendation }) {
  const { projectId } = useProject();
  const start = useStartRun(projectId);
  const { run } = useActiveRun(projectId);
  const toast = useToast();
  const base = `/app/p/${projectId}`;
  if (rec.key === 'run-monitoring')
    return (
      <Button
        size="sm"
        icon={Play}
        loading={(!!run && !isWaitingOnBatch(run)) || start.isPending}
        disabled={isWaitingOnBatch(run)}
        onClick={() => start.mutate({}, { onError: (e) => toast.error(copy.app.runCheck.failed, errorMessage(e)) })}
      >
        {copy.app.runCheck.idle}
      </Button>
    );
  const engine = rec.key.startsWith('engine:') ? rec.key.slice('engine:'.length) : null;
  const target =
    engine && isEngineId(engine)
      ? { to: `${base}/responses?engine=${engine}`, label: P.card.viewAnswers }
      : rec.key === 'install-tracking'
        ? { to: `${base}/integrations`, label: copy.pages.crawlers.empty.cta }
        : rec.category === 'technical' || ['run-audit', 'indexable', 'sitemap', 'meta-tags', 'ssr-content'].includes(rec.key)
          ? { to: `${base}/readiness`, label: fmt(P.card.open, { page: copy.nav.items.readiness }) }
          : null;
  if (!target) return null;
  return (
    <ButtonLink size="sm" to={target.to} iconRight={ArrowRight}>
      {target.label}
    </ButtonLink>
  );
}

interface RecCardProps {
  rec: Recommendation;
  draft: Draft | undefined;
  pending: boolean;
  disabled: boolean;
  onDraft: () => void;
  onOpenDraft: (id: string) => void;
}

function RecCard({ rec, draft, pending, disabled, onDraft, onOpenDraft }: RecCardProps) {
  const { projectId } = useProject();
  const CatIcon = CATEGORY_ICONS[rec.category];
  const ImpactIcon = IMPACT_ICONS[rec.impact];
  const closed = rec.status === 'done' || rec.status === 'dismissed';
  return (
    <Card as="article" className={cn('p-4 sm:p-5', closed && 'bg-surface/60')}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex shrink-0 items-center gap-2 sm:w-14 sm:flex-col sm:items-start sm:gap-0.5" title={fmt(R.priority, { priority: rec.priority })}>
          <span className="font-display font-heading text-xl leading-7 tracking-[-0.012em] text-text-strong tnum">{rec.priority}</span>
          <span className="eyebrow">{P.columns.priority}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" icon={CatIcon}>
              {R.category[rec.category]}
            </Badge>
            <Badge tone="outline" icon={ImpactIcon}>
              {R.impact[rec.impact]}
            </Badge>
            <Badge tone="outline">{R.effort[rec.effort]}</Badge>
            {isQuickWin(rec) && (
              <Tooltip content={R.quickWinTooltip}>
                <span tabIndex={0} className="inline-flex rounded-sm">
                  <Badge tone="info">{R.quickWin}</Badge>
                </span>
              </Tooltip>
            )}
          </div>
          <h3 className={cn('text-base font-semibold leading-6', closed ? 'text-text-muted' : 'text-text-strong')}>{rec.title}</h3>
          <p className="mt-1 max-w-3xl text-[13px] leading-5 text-text-muted">{rec.description}</p>
          <Evidence items={rec.evidence} />
          {(rec.driver || rec.relatedPromptIds.length > 0) && (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
              {rec.driver && (
                <Link to={`/app/p/${projectId}/diagnose`} className="hover:text-text hover:underline">
                  {fmt(P.card.driver, { driver: copy.labels.driver[rec.driver] })}
                </Link>
              )}
              {rec.relatedPromptIds.length > 0 && <span>{plural(rec.relatedPromptIds.length, P.card.relatedPrompts)}</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-row-reverse flex-wrap items-start justify-end gap-2 sm:flex-col sm:items-end sm:justify-start">
          <StatusMenu rec={rec} />
          {draft ? (
            <Button size="sm" icon={DRAFT_KIND_ICONS[draft.kind]} onClick={() => onOpenDraft(draft.id)}>
              {R.viewDraft}
            </Button>
          ) : (
            !closed &&
            (rec.draft ? (
              <Button size="sm" icon={FilePen} loading={pending} disabled={disabled && !pending} onClick={onDraft}>
                {pending ? R.generating : R.generate}
              </Button>
            ) : (
              <RecShortcut rec={rec} />
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- recommended tab

function RecommendedPanel({ recs, drafts, agent }: { recs: Recommendation[]; drafts: Draft[] | undefined; agent: ReturnType<typeof useDraftAgent> }) {
  const [, setParams] = useSearchParams();
  const [status, setStatus] = useTabParam('status', STATUSES, 'open');
  const [category, setCategory] = useTabParam<'all' | RecCategory>('category', ['all', ...CATEGORIES], 'all');
  const [impact, setImpact] = useTabParam<'all' | RecImpact>('impact', ['all', ...IMPACTS], 'all');
  const [driver, setDriver] = useTabParam<'all' | DriverId>('driver', ['all', ...DRIVERS], 'all');
  const byRec = useMemo(() => draftsByRec(drafts), [drafts]);

  const filtered = useMemo(
    () =>
      recs
        .filter((r) => (category === 'all' || r.category === category) && (impact === 'all' || r.impact === impact) && (driver === 'all' || r.driver === driver))
        .sort((a, b) => b.priority - a.priority),
    [recs, category, impact, driver],
  );
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, filtered.filter((r) => r.status === s).length])) as Record<RecStatus, number>, [filtered]);
  const shown = filtered.filter((r) => r.status === status);
  const hasFilters = category !== 'all' || impact !== 'all' || driver !== 'all';
  const clearFilters = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of ['category', 'impact', 'driver']) next.delete(k);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SegmentedControl<RecStatus>
          label={P.filters.status}
          size="md"
          value={status}
          onChange={setStatus}
          className="scrollbar-none max-w-full overflow-x-auto"
          options={STATUSES.map((s) => ({
            value: s,
            label: (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {R.status[s]}
                <span className="font-mono text-2xs text-text-subtle tnum">{counts[s]}</span>
              </span>
            ),
          }))}
        />
        <div className="flex flex-wrap items-end gap-2">
          {driver !== 'all' && (
            <button
              type="button"
              onClick={() => setDriver('all')}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-soft px-2.5 text-xs font-medium text-accent hover:underline"
              aria-label={`${fmt(P.filters.driver, { driver: copy.labels.driver[driver] })}. ${P.filters.clearDriver}`}
            >
              {fmt(P.filters.driver, { driver: copy.labels.driver[driver] })}
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          )}
          <Select<'all' | RecCategory>
            label={P.filters.category}
            hideLabel
            value={category}
            onChange={setCategory}
            wrapperClassName="w-44"
            options={[{ value: 'all', label: P.filters.allCategories }, ...CATEGORIES.map((c) => ({ value: c, label: R.category[c] }))]}
          />
          <Select<'all' | RecImpact>
            label={P.filters.impact}
            hideLabel
            value={impact}
            onChange={setImpact}
            wrapperClassName="w-44"
            options={[{ value: 'all', label: P.filters.allImpacts }, ...IMPACTS.map((c) => ({ value: c, label: R.impact[c] }))]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        hasFilters && filtered.length === 0 ? (
          <EmptyState
            bordered
            title={P.filteredEmpty.title}
            body={P.filteredEmpty.body}
            action={<Button onClick={clearFilters}>{P.filteredEmpty.cta}</Button>}
          />
        ) : status === 'open' ? (
          <EmptyState bordered icon={CheckCircle2} title={P.allDone.title} body={P.allDone.body} />
        ) : (
          <EmptyState bordered size="sm" title={status === 'done' ? P.doneEmpty : P.statusEmpty[status]} />
        )
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.key}>
              <RecCard
                rec={r}
                draft={byRec.get(r.key)}
                pending={agent.pendingKey === r.key}
                disabled={!!agent.pendingKey}
                onOpenDraft={agent.open}
                onDraft={() => r.draft && agent.draft({ kind: r.draft.kind, params: { ...r.draft.params, recKey: r.key } }, r.key)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- drafts tab

function NewDraftMenu({ agent, variant = 'secondary' }: { agent: ReturnType<typeof useDraftAgent>; variant?: 'primary' | 'secondary' }) {
  return (
    <Menu
      label={P.newDraftMenu}
      align="end"
      className="min-w-60"
      items={[
        { heading: P.newDraftMenu },
        ...DRAFT_KINDS.map((k) => ({ key: k, label: D.kind[k], icon: DRAFT_KIND_ICONS[k], onSelect: () => agent.draft({ kind: k }, `new:${k}`) })),
      ]}
      trigger={(props) => (
        <Button {...props} variant={variant} icon={Plus} loading={!!agent.pendingKey?.startsWith('new:')} iconRight={ChevronDown}>
          {P.newDraft}
        </Button>
      )}
    />
  );
}

function DraftsPanel({ drafts, isLoading, agent }: { drafts: Draft[] | undefined; isLoading: boolean; agent: ReturnType<typeof useDraftAgent> }) {
  const C = D.columns;
  if (isLoading) return <SkeletonCard height={240} />;
  if (!drafts?.length) {
    return (
      <EmptyState
        bordered
        size="lg"
        illustration={<EmptyActions width={160} />}
        title={P.draftsEmpty.title}
        body={P.draftsEmpty.body}
        action={<NewDraftMenu agent={agent} variant="primary" />}
      />
    );
  }
  return (
    <Card>
      <div className="flex flex-col gap-1 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-[13px] text-text-muted">{P.draftsBody}</p>
        <NewDraftMenu agent={agent} />
      </div>
      <div className="mt-3">
        <Table aria-label={P.tabs.drafts}>
          <THead>
            <tr>
              <Th>{C.title}</Th>
              <Th className="hidden md:table-cell">{C.kind}</Th>
              <Th>{C.status}</Th>
              <Th className="hidden lg:table-cell">{P.draftsWrittenBy}</Th>
              <Th num className="hidden sm:table-cell">
                {C.updated}
              </Th>
            </tr>
          </THead>
          <TBody>
            {drafts.map((d) => (
              <Tr key={d.id} interactive onClick={() => agent.open(d.id)}>
                <Td className="max-w-0 w-full">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      agent.open(d.id);
                    }}
                    className="flex w-full min-w-0 items-center gap-2.5 text-left"
                  >
                    <DraftKindIcon kind={d.kind} size={26} />
                    <span className={cn('truncate font-medium', d.status === 'dismissed' ? 'text-text-muted' : 'text-text')}>{d.title}</span>
                  </button>
                </Td>
                <Td muted className="hidden whitespace-nowrap md:table-cell">
                  {D.kind[d.kind]}
                </Td>
                <Td className="whitespace-nowrap">
                  <DraftStatusBadge status={d.status} />
                </Td>
                <Td className="hidden whitespace-nowrap lg:table-cell">
                  <DraftModeBadge mode={d.mode} />
                </Td>
                <Td num muted className="hidden whitespace-nowrap sm:table-cell" title={d.updatedAt}>
                  {relativeTime(d.updatedAt)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- states

function NoActions() {
  const { projectId } = useProject();
  const start = useStartRun(projectId);
  const { run } = useActiveRun(projectId);
  const toast = useToast();
  return (
    <EmptyState
      bordered
      size="lg"
      illustration={<EmptyActions width={160} />}
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
  );
}

// ---------------------------------------------------------------------------- page

const TABS = ['recommended', 'drafts'] as const;

export default function ActionsPage() {
  const { projectId } = useProject();
  const recs = useRecommendations(projectId);
  const drafts = useDrafts(projectId);
  const agent = useDraftAgent(projectId);
  const [tab, setTab] = useTabParam('tab', TABS, 'recommended');
  const list = recs.data ?? [];
  const open = list.filter((r) => r.status === 'open');
  const waiting = (drafts.data ?? []).filter((d) => d.status === 'draft').length;

  return (
    <Page>
      <PageHeader title={P.title} subtitle={P.subtitle} className="mb-0" />

      <p className="-mt-2 flex items-start gap-2 text-[13px] text-text-muted">
        <ShieldCheck size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-text-subtle" />
        <span>
          {recs.data && (
            <span className="font-medium text-text">
              {fmt(P.summary, { open: open.length, quickWins: plural(open.filter(isQuickWin).length, P.quickWinsCount), drafts: plural(waiting, P.draftsCount) })}{' '}
            </span>
          )}
          {R.humanInLoop}
        </span>
      </p>

      <div>
        <Tabs
          idBase="actions"
          label={P.title}
          value={tab}
          onValueChange={setTab}
          items={[
            { value: 'recommended', label: P.tabs.recommended, count: recs.data ? open.length : undefined },
            { value: 'drafts', label: P.tabs.drafts, count: drafts.data?.length },
          ]}
        />
        <TabPanel idBase="actions" value={tab} className="pt-4">
          {tab === 'drafts' ? (
            <DraftsPanel drafts={drafts.data} isLoading={drafts.isLoading} agent={agent} />
          ) : recs.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <SkeletonCard height={110} />
              <SkeletonCard height={110} />
              <SkeletonCard height={110} />
            </div>
          ) : recs.isError ? (
            <ErrorState bordered title={copy.app.errors.generic.title} error={recs.error} onRetry={() => void recs.refetch()} retrying={recs.isFetching} />
          ) : list.length === 0 ? (
            <NoActions />
          ) : (
            <RecommendedPanel recs={list} drafts={drafts.data} agent={agent} />
          )}
        </TabPanel>
      </div>
      <DraftDrawer {...agent.drawerProps} />
    </Page>
  );
}
