// AI crawlers (Hardal-style): who reads the site, by operator and purpose, which pages they read and
// miss, new-agent alerts, response codes and a filterable visit log. Period filter only.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, FileUp, Plug, ShieldAlert, X } from 'lucide-react';
import type { AgentCategory, BotVerification, CrawlerOverview } from '@shared/types';
import { EmptyCrawlers } from '@/components/art';
import { BarList, DonutChart, StackedAreaChart, type SeriesDef } from '@/components/charts';
import { useProject } from '@/components/layout';
import { AGENT_CATEGORIES, CategoryBadge, LogUploadForm, StatusCodeChip, statusClass, VERIFICATIONS, VerifiedBadge, verificationOf } from '@/components/site';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorState,
  InfoTip,
  KpiCard,
  Page,
  PageHeader,
  ProgressBar,
  Select,
  SkeletonCard,
  StatGrid,
  Table,
  TableEmpty,
  TabPanel,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr,
  useSort,
  useTabParam,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { useBotEvents, useCrawlerOverview } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AGENT_CATEGORY_COLORS } from '@/lib/colors';
import { useFilters } from '@/lib/filters';
import { compact, date, dateTime, num, pct, relativeTime } from '@/lib/format';

const P = copy.pages.crawlers;
const C = P.columns;
const TABS = ['agents', 'platforms', 'pages', 'events'] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZE = 50;
/** Visit-log filters kept in the URL; opening the log from elsewhere on the page resets them. */
const LOG_FILTERS = ['agent', 'operator', 'category', 'verification'];

/** Categories counted in the "AI crawler visits" KPI (matches the server's `totals.visits`). */
const AI_AGENT_CATEGORIES: AgentCategory[] = ['training', 'search', 'user_fetch', 'agent'];
const categoriesIn = (ov: CrawlerOverview) => AGENT_CATEGORIES.filter((c) => ov.byCategory.some((x) => x.category === c && x.visits > 0));

/** `?category=` shared by the Agents chips and the visit-log filter. */
function useCategoryParam() {
  return useTabParam<'all' | AgentCategory>('category', ['all', ...AGENT_CATEGORIES], 'all');
}

// ---------------------------------------------------------------------------- KPIs + alerts

function KpiRow({ ov, days }: { ov: CrawlerOverview; days: number }) {
  const t = ov.totals;
  const vs = (d: number | null) => (d == null ? copy.filters.noPrior : fmt(copy.filters.vsPrior, { days }));
  const trend = ov.trend.map((r) => {
    let s = 0;
    let any = false;
    // Same definition as the KPI value: AI agents only (search engines and SEO tools are excluded).
    for (const c of AI_AGENT_CATEGORIES) if (typeof r[c] === 'number') ((s += r[c] as number), (any = true));
    return any ? s : null;
  });
  return (
    <StatGrid cols={{ base: 2, xl: 4 }}>
      <KpiCard
        label={P.kpis.visits}
        info={t.allVisits ? fmt(P.kpis.visitsInfo, { all: num(t.allVisits.value) }) : undefined}
        value={compact(t.visits.value)}
        delta={t.visits.delta}
        deltaKind="count"
        comparison={vs(t.visits.delta)}
        trend={trend}
        trendColor="var(--color-chart-other)"
      />
      <KpiCard label={P.kpis.agents} value={num(t.agents.value)} delta={t.agents.delta} deltaKind="count" comparison={vs(t.agents.delta)} />
      <KpiCard label={P.kpis.pages} value={num(t.pages.value)} delta={t.pages.delta} deltaKind="count" comparison={vs(t.pages.delta)} />
      <KpiCard label={P.kpis.operators} value={num(t.operators.value)} delta={t.operators.delta} deltaKind="count" comparison={vs(t.operators.delta)} />
    </StatGrid>
  );
}

/** Share of AI visits from IPs their operator publishes, and hits that only claim to be a known agent. */
function VerificationStrip({ ov, onFakes }: { ov: CrawlerOverview; onFakes: () => void }) {
  const V = P.verification;
  const total = ov.totals.visits.value;
  const verified = ov.totals.verifiedVisits?.value;
  const fakes = ov.totals.spoofedVisits?.value ?? 0;
  if (verified === undefined || (!total && !fakes)) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] md:flex-row md:items-center md:gap-6">
      {total > 0 && (
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <BadgeCheck size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-success" />
          <p className="min-w-0 text-text-muted">
            <span className="font-medium text-text">{fmt(V.share, { share: pct(verified / total) })}</span>
            {' · '}
            {fmt(V.shareBody, { verified: num(verified), total: num(total) })}
          </p>
          <InfoTip term={copy.glossary.concepts.verifiedVisit} className="mt-px shrink-0" />
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <ShieldAlert size={16} strokeWidth={1.75} aria-hidden className={cn('shrink-0', fakes ? 'text-danger' : 'text-text-subtle')} />
        <span className="font-medium text-text">{plural(fakes, V.fakes, { count: num(fakes) })}</span>
        <InfoTip term={V.fakesInfo} />
        {fakes > 0 && (
          <button type="button" onClick={onFakes} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            {V.viewFakes}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function Alerts({ ov, onAgent }: { ov: CrawlerOverview; onAgent: (agentId: string) => void }) {
  const serverErrors = ov.statusCodes.filter((s) => s.status >= 500).reduce((n, s) => n + s.visits, 0);
  if (!ov.newAgents.length && !serverErrors) return null;
  return (
    <div className="flex flex-col gap-2" role="status">
      {ov.newAgents.map((a) => (
        <div key={a.agentId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface px-4 py-3 text-[13px]">
          <Badge tone="accent">{copy.app.badges.new}</Badge>
          <span className="min-w-0 flex-1 text-text">{fmt(P.alerts.newAgent, { name: a.name, date: date(a.firstSeen) })}</span>
          <button type="button" onClick={() => onAgent(a.agentId)} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            {P.viewVisits}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ))}
      {serverErrors > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-transparent bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
          <span>{fmt(P.alerts.serverErrors, { count: num(serverErrors) })}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- trend + response codes

function TrendCard({ ov }: { ov: CrawlerOverview }) {
  const cats = categoriesIn(ov);
  const series: SeriesDef[] = cats.map((c) => ({ key: c, name: copy.labels.agentCategory[c], color: AGENT_CATEGORY_COLORS[c] }));
  return (
    <Card className="xl:col-span-2">
      <CardHeader title={P.sections.trend} subtitle={P.trendBody} />
      <div className="px-4 pb-4 pt-3">
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {[...cats].reverse().map((c) => (
            <li key={c}>
              <CategoryBadge category={c} info />
            </li>
          ))}
        </ul>
        <StackedAreaChart data={ov.trend} series={series} legend={false} height={260} ariaLabel={`${P.sections.trend}: ${series.map((s) => s.name).join(', ')}`} />
      </div>
    </Card>
  );
}

function StatusCodesCard({ ov }: { ov: CrawlerOverview }) {
  const total = ov.statusCodes.reduce((n, s) => n + s.visits, 0);
  const notFound = ov.statusCodes.filter((s) => s.status === 404).reduce((n, s) => n + s.visits, 0);
  const toneFor = (s: number) => {
    const c = statusClass(s);
    return c === 'ok' ? 'success' : c === 'server' ? 'danger' : c === 'client' ? 'warning' : 'neutral';
  };
  return (
    <Card className="flex flex-col">
      <CardHeader title={P.sections.statusCodes} subtitle={P.statusCodesBody} />
      <ul className="flex flex-col gap-3 px-4 pb-4 pt-4">
        {ov.statusCodes.length === 0 && <li className="py-6 text-center text-[13px] text-text-subtle">{P.eventsEmpty}</li>}
        {[...ov.statusCodes]
          .sort((a, b) => b.visits - a.visits)
          .map((s) => (
            <li key={s.status}>
              <div className="flex items-center justify-between gap-3">
                <StatusCodeChip status={s.status} />
                <span className="font-mono text-[13px] text-text tnum">
                  {pct(total ? s.visits / total : null)} <span className="text-text-subtle">· {num(s.visits)}</span>
                </span>
              </div>
              <ProgressBar value={total ? s.visits / total : 0} tone={toneFor(s.status)} size="xs" label={`HTTP ${s.status}`} className="mt-1.5" />
            </li>
          ))}
      </ul>
      {notFound > 0 && <p className="mt-auto border-t border-border px-4 py-3 text-xs text-text-muted">{fmt(P.alerts.notFound, { count: num(notFound) })}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------- tabs

function CategoryChips({ ov, value, onChange }: { ov: CrawlerOverview; value: 'all' | AgentCategory; onChange: (v: 'all' | AgentCategory) => void }) {
  const cats = categoriesIn(ov);
  const count = (c: AgentCategory) => ov.byAgent.filter((a) => a.category === c).length;
  const chip = (active: boolean) =>
    cn(
      'inline-flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-medium transition-colors',
      active ? 'border-primary bg-primary-soft text-accent' : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
    );
  return (
    <div role="group" aria-label={C.category} className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={value === 'all'} onClick={() => onChange('all')} className={chip(value === 'all')}>
        {P.filters.allCategories}
        <span className="font-mono text-2xs tnum">{ov.byAgent.length}</span>
      </button>
      {cats.map((c) => (
        <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(c)} className={chip(value === c)}>
          <span aria-hidden className="size-2 rounded-xs" style={{ background: AGENT_CATEGORY_COLORS[c] }} />
          {copy.labels.agentCategory[c]}
          <span className="font-mono text-2xs tnum">{count(c)}</span>
        </button>
      ))}
    </div>
  );
}

function AgentsPanel({ ov, onAgent }: { ov: CrawlerOverview; onAgent: (agentId: string) => void }) {
  const [category, setCategory] = useCategoryParam();
  const list = useMemo(() => ov.byAgent.filter((a) => category === 'all' || a.category === category), [ov.byAgent, category]);
  const { rows, sortProps } = useSort(
    list,
    { name: (a) => a.name, operator: (a) => a.operator, category: (a) => a.category, visits: (a) => a.visits, pages: (a) => a.pages, share: (a) => a.share, lastSeen: (a) => a.lastSeen },
    { key: 'visits', dir: 'desc' },
  );
  const top = Math.max(...ov.byAgent.map((a) => a.share), 0.01);
  return (
    <Card>
      <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:items-center md:justify-between">
        <CategoryChips ov={ov} value={category} onChange={setCategory} />
      </div>
      <div className="mt-3">
        <Table aria-label={P.sections.byAgent}>
          <THead>
            <tr>
              <Th {...sortProps('name', 'asc')}>{C.agent}</Th>
              <Th {...sortProps('operator', 'asc')} className="hidden md:table-cell">
                {C.operator}
              </Th>
              <Th {...sortProps('category', 'asc')} className="hidden sm:table-cell">
                {C.category}
              </Th>
              <Th num {...sortProps('visits')}>
                {C.visits}
              </Th>
              <Th num {...sortProps('pages')} className="hidden lg:table-cell">
                {C.pages}
              </Th>
              <Th num {...sortProps('share')} className="hidden md:table-cell">
                {C.share}
              </Th>
              <Th num {...sortProps('lastSeen')} className="hidden sm:table-cell">
                {C.lastSeen}
              </Th>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={7}>{P.eventsEmpty}</TableEmpty>
            ) : (
              rows.map((a) => (
                <Tr key={a.agentId} interactive onClick={() => onAgent(a.agentId)}>
                  <Td>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAgent(a.agentId);
                      }}
                      title={P.viewVisits}
                      className="flex min-w-0 items-center gap-2 text-left font-medium text-text hover:text-accent"
                    >
                      <span className="truncate">{a.name}</span>
                      {ov.newAgents.some((n) => n.agentId === a.agentId) && <Badge tone="accent">{copy.app.badges.new}</Badge>}
                    </button>
                    <span className="block text-xs text-text-subtle md:hidden">{a.operator}</span>
                  </Td>
                  <Td muted className="hidden md:table-cell">
                    {a.operator}
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <CategoryBadge category={a.category} />
                  </Td>
                  <Td num>{num(a.visits)}</Td>
                  <Td num className="hidden lg:table-cell">
                    {num(a.pages)}
                  </Td>
                  <Td num className="hidden md:table-cell">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-xs bg-well lg:block" aria-hidden>
                        <span className="block h-full" style={{ width: `${(a.share / top) * 100}%`, background: AGENT_CATEGORY_COLORS[a.category] }} />
                      </span>
                      {pct(a.share)}
                    </span>
                  </Td>
                  <Td num muted className="hidden whitespace-nowrap sm:table-cell" title={dateTime(a.lastSeen)}>
                    {relativeTime(a.lastSeen)}
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

function PlatformsPanel({ ov, onOperator }: { ov: CrawlerOverview; onOperator: (op: string) => void }) {
  const total = ov.byCategory.reduce((n, c) => n + c.visits, 0);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={P.sections.byOperator} subtitle={P.byOperatorBody} />
        <div className="px-2 pb-3 pt-2">
          <BarList
            labelHeader={C.operator}
            valueHeader={C.visits}
            limit={10}
            items={ov.byOperator.map((o) => ({
              key: o.operator,
              label: o.operator,
              value: o.visits,
              display: num(o.visits),
              meta: `${plural(o.agents, P.agentCount)} · ${pct(o.share)}`,
              onClick: () => onOperator(o.operator),
            }))}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title={P.sections.byCategory} subtitle={P.byCategoryBody} />
        <div className="p-4">
          <DonutChart
            size={176}
            data={AGENT_CATEGORIES.map((c) => ({ key: c, name: copy.labels.agentCategory[c], value: ov.byCategory.find((x) => x.category === c)?.visits ?? 0, color: AGENT_CATEGORY_COLORS[c] })).filter((d) => d.value > 0)}
            center={
              <>
                <span className="font-display font-heading text-xl leading-7 tracking-[-0.012em] text-text-strong tnum">{compact(total)}</span>
                <span className="text-2xs text-text-subtle">{C.visits.toLowerCase()}</span>
              </>
            }
          />
          <ul className="mt-5 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
            {categoriesIn(ov).map((c) => (
              <li key={c} className="text-xs text-text-muted">
                <span className="font-medium text-text">{copy.glossary.agentCategories[c].term}.</span> {copy.glossary.agentCategories[c].short}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function PagesPanel({ ov }: { ov: CrawlerOverview }) {
  const { projectId } = useProject();
  const { rows, sortProps } = useSort(
    ov.topPages,
    { path: (p) => p.path, visits: (p) => p.visits, agents: (p) => p.agents, top: (p) => p.topAgent, lastSeen: (p) => p.lastSeen },
    { key: 'visits', dir: 'desc' },
  );
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title={P.sections.topPages}
          subtitle={
            ov.topPages.length < ov.totals.pages.value
              ? `${P.topPagesBody} ${fmt(P.topPagesOf, { shown: num(ov.topPages.length), total: num(ov.totals.pages.value) })}`
              : P.topPagesBody
          }
        />
        <div className="mt-3">
          <Table aria-label={P.sections.topPages} maxHeight={560}>
            <THead>
              <tr>
                <Th {...sortProps('path', 'asc')}>{C.path}</Th>
                <Th num {...sortProps('visits')}>
                  {C.visits}
                </Th>
                <Th num {...sortProps('agents')} className="hidden sm:table-cell">
                  {C.agents}
                </Th>
                <Th {...sortProps('top', 'asc')} className="hidden md:table-cell">
                  {C.topAgent}
                </Th>
                <Th num {...sortProps('lastSeen')} className="hidden lg:table-cell">
                  {C.lastSeen}
                </Th>
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={5}>{P.eventsEmpty}</TableEmpty>
              ) : (
                rows.map((p) => (
                  <Tr key={p.path}>
                    <Td className="max-w-[18rem] font-mono text-[12.5px]">
                      <span className="block truncate" title={p.path}>
                        {p.path}
                      </span>
                    </Td>
                    <Td num>{num(p.visits)}</Td>
                    <Td num className="hidden sm:table-cell">
                      {num(p.agents)}
                    </Td>
                    <Td muted className="hidden whitespace-nowrap md:table-cell">
                      {p.topAgent}
                    </Td>
                    <Td num muted className="hidden whitespace-nowrap lg:table-cell" title={dateTime(p.lastSeen)}>
                      {relativeTime(p.lastSeen)}
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </Card>
      <Card className="flex flex-col">
        <CardHeader
          title={P.sections.missedPages}
          titleAddon={<InfoTip term={copy.glossary.concepts.missedPages} />}
          subtitle={P.sections.missedPagesBody}
          actions={ov.missedPages.length > 0 && <Badge tone="warning">{ov.missedPages.length}</Badge>}
        />
        {ov.missedPages.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-subtle">{P.noMissed}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {ov.missedPages.map((m) => (
              <li key={m.path} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate font-mono text-[12.5px] text-text" title={m.path}>
                  {m.path}
                </span>
                <Badge tone="outline">{P.missedSource[m.source]}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto px-4 py-3">
          <p className="mb-2 text-xs text-text-muted">{copy.glossary.concepts.missedPages.long}</p>
          <Link to={`/app/p/${projectId}/actions?category=crawlers`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            {P.missedCta}
            <ArrowRight size={12} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </Card>
    </div>
  );
}

function EventsPanel({ ov, days }: { ov: CrawlerOverview; days: number }) {
  const { projectId } = useProject();
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useCategoryParam();
  const agent = params.get('agent') ?? '';
  const operator = params.get('operator') ?? '';
  const verification = VERIFICATIONS.find((v) => v === params.get('verification')) ?? '';
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [agent, operator, category, verification, days]);
  const q = useBotEvents(projectId, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    agent: agent || undefined,
    operator: operator || undefined,
    category: category === 'all' ? undefined : category,
    verification: verification || undefined,
    days,
  });
  const data = q.data;
  const setParam = (k: string, v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true },
    );
  const agentOptions = [...ov.byAgent].sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ value: a.agentId, label: a.name }));
  // An agent from a link (or older than this period) still shows as the selected option.
  if (agent && !agentOptions.some((a) => a.value === agent)) agentOptions.push({ value: agent, label: agent });
  const filtered = !!agent || !!operator || category !== 'all' || !!verification;
  const from = data && data.total ? data.offset + 1 : 0;
  const to = data ? Math.min(data.offset + data.items.length, data.total) : 0;
  const sourceLabel = (s: string) => (P.eventSource as Record<string, string>)[s] ?? s;

  return (
    <Card>
      <div className="flex flex-col gap-3 px-4 pt-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
          <Select
            label={C.agent}
            hideLabel
            size="sm"
            value={agent}
            onChange={(v) => setParam('agent', v)}
            wrapperClassName="lg:w-48"
            options={[{ value: '', label: P.filters.allAgents }, ...agentOptions]}
          />
          <Select<'all' | AgentCategory>
            label={C.category}
            hideLabel
            size="sm"
            value={category}
            onChange={setCategory}
            wrapperClassName="lg:w-44"
            options={[{ value: 'all', label: P.filters.allCategories }, ...AGENT_CATEGORIES.map((c) => ({ value: c, label: copy.labels.agentCategory[c] }))]}
          />
          <Select
            label={C.operator}
            hideLabel
            size="sm"
            value={operator}
            onChange={(v) => setParam('operator', v)}
            wrapperClassName="lg:w-44"
            options={[{ value: '', label: P.filters.allOperators }, ...[...ov.byOperator].sort((a, b) => a.operator.localeCompare(b.operator)).map((o) => ({ value: o.operator, label: o.operator }))]}
          />
          <Select<'' | BotVerification>
            label={C.verified}
            hideLabel
            size="sm"
            value={verification}
            onChange={(v) => setParam('verification', v)}
            wrapperClassName="lg:w-40"
            options={[{ value: '', label: P.verification.anyStatus }, ...VERIFICATIONS.map((v) => ({ value: v, label: P.verification[v].label }))]}
          />
          {filtered && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    for (const k of LOG_FILTERS) next.delete(k);
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              {copy.common.clearFilters}
            </Button>
          )}
        </div>
        <p className="font-mono text-xs text-text-subtle tnum" aria-live="polite">
          {data ? fmt(copy.common.pagination.range, { from: num(from), to: num(to), total: num(data.total) }) : ' '}
        </p>
      </div>
      <div className={cn('mt-3 transition-opacity duration-160', q.isPlaceholderData && 'opacity-60')}>
        {q.isError ? (
          <ErrorState size="sm" error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <Table aria-label={P.sections.events} dense>
            <THead>
              <tr>
                <Th>{C.time}</Th>
                <Th>{C.agent}</Th>
                <Th className="hidden lg:table-cell">{C.operator}</Th>
                <Th className="hidden xl:table-cell">{C.category}</Th>
                <Th>{C.path}</Th>
                <Th>{C.status}</Th>
                <Th className="hidden md:table-cell">{C.verified}</Th>
                <Th className="hidden xl:table-cell">{C.source}</Th>
              </tr>
            </THead>
            <TBody>
              {q.isLoading ? (
                <TableEmpty colSpan={8}>{copy.app.loading.default}</TableEmpty>
              ) : !data?.items.length ? (
                <TableEmpty colSpan={8}>{P.eventsEmpty}</TableEmpty>
              ) : (
                data.items.map((e) => (
                  <Tr key={e.id}>
                    <Td muted className="whitespace-nowrap font-mono text-[12.5px] tnum" title={e.ts}>
                      {dateTime(e.ts)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Tooltip
                        content={
                          <span className="block">
                            <span className="mb-0.5 block font-semibold">{C.userAgent}</span>
                            <span className="block break-all font-mono text-[11px] text-text-muted">{e.userAgent}</span>
                            {e.ip && <span className="mt-1 block font-mono text-[11px] text-text-subtle">{C.ip} {e.ip}</span>}
                          </span>
                        }
                      >
                        <button type="button" className="cursor-help font-medium text-text decoration-dotted underline-offset-2 hover:underline">
                          {e.agentName}
                        </button>
                      </Tooltip>
                    </Td>
                    <Td muted className="hidden whitespace-nowrap lg:table-cell">
                      {e.operator}
                    </Td>
                    <Td className="hidden xl:table-cell">
                      <CategoryBadge category={e.category} />
                    </Td>
                    <Td className="max-w-[16rem] font-mono text-[12px]">
                      <span className="block truncate" title={e.path}>
                        {e.path}
                      </span>
                    </Td>
                    <Td>
                      <StatusCodeChip status={e.status} />
                    </Td>
                    <Td className="hidden md:table-cell">
                      <VerifiedBadge status={verificationOf(e)} />
                    </Td>
                    <Td muted className="hidden whitespace-nowrap xl:table-cell">
                      {sourceLabel(e.source)}
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        )}
      </div>
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button size="sm" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {copy.common.pagination.previous}
          </Button>
          <Button size="sm" iconRight={ChevronRight} disabled={to >= data.total} onClick={() => setPage((p) => p + 1)}>
            {copy.common.pagination.next}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------- page

function NoCrawlers({ onUpload }: { onUpload: () => void }) {
  const { projectId } = useProject();
  return (
    <EmptyState
      bordered
      size="lg"
      illustration={<EmptyCrawlers width={180} />}
      title={P.empty.title}
      body={P.empty.body}
      action={
        <ButtonLink to={`/app/p/${projectId}/integrations`} variant="primary" icon={Plug}>
          {P.empty.cta}
        </ButtonLink>
      }
      secondaryAction={
        <Button icon={FileUp} onClick={onUpload}>
          {P.upload.button}
        </Button>
      }
    />
  );
}

export default function CrawlersPage() {
  const { projectId } = useProject();
  const { days } = useFilters();
  const q = useCrawlerOverview(projectId, { days });
  const [tab, setTab] = useTabParam<Tab>('tab', TABS, 'agents');
  const [, setParams] = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(false);
  const ov = q.data;

  /** Jump to the visit log filtered to one agent or operator. */
  const openLog = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of LOG_FILTERS) next.delete(k);
        for (const [k, v] of Object.entries(patch)) next.set(k, v);
        next.set('tab', 'events');
        return next;
      },
      { replace: true },
    );

  const empty = ov && ov.totals.visits.value === 0 && ov.byAgent.length === 0;

  return (
    <Page>
      <PageHeader
        title={P.title}
        subtitle={P.subtitle}
        className="mb-0"
        actions={
          !empty && (
            <Button icon={FileUp} onClick={() => setUploadOpen(true)}>
              {P.upload.button}
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <StatGrid cols={{ base: 2, xl: 4 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <KpiCard key={i} label=" " value="" loading />
            ))}
          </StatGrid>
          <SkeletonCard height={260} />
        </div>
      ) : q.isError || !ov ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : empty ? (
        <NoCrawlers onUpload={() => setUploadOpen(true)} />
      ) : (
        <div className={cn('space-y-4 transition-opacity duration-160', q.isPlaceholderData && 'opacity-60')}>
          <KpiRow ov={ov} days={days} />
          <VerificationStrip ov={ov} onFakes={() => openLog({ verification: 'spoofed' })} />
          <Alerts ov={ov} onAgent={(agentId) => openLog({ agent: agentId })} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <TrendCard ov={ov} />
            <StatusCodesCard ov={ov} />
          </div>
          <div>
            <Tabs
              idBase="crawlers"
              label={P.title}
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'agents', label: P.tabs.agents, count: ov.byAgent.length },
                { value: 'platforms', label: P.tabs.platforms, count: ov.byOperator.length },
                // The API returns the top pages only, so its length isn't a page count: use the KPI's total.
                { value: 'pages', label: P.tabs.pages, count: ov.totals.pages.value },
                { value: 'events', label: P.tabs.events },
              ]}
            />
            <TabPanel idBase="crawlers" value={tab} className="pt-4">
              {tab === 'agents' && <AgentsPanel ov={ov} onAgent={(agentId) => openLog({ agent: agentId })} />}
              {tab === 'platforms' && <PlatformsPanel ov={ov} onOperator={(operator) => openLog({ operator })} />}
              {tab === 'pages' && <PagesPanel ov={ov} />}
              {tab === 'events' && <EventsPanel ov={ov} days={days} />}
            </TabPanel>
          </div>
        </div>
      )}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} size="lg" title={P.upload.title} description={P.upload.body}>
        <LogUploadForm projectId={projectId} rows={10} />
      </Dialog>
    </Page>
  );
}
