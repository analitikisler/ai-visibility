// AI readiness: audit a public URL (robots.txt AI rules, llms.txt, schema, meta, SSR, speed),
// show the checks with fixes, the per-agent robots matrix, llms.txt, page facts and audit history.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, ExternalLink, FilePen, Info, Minus, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
import type { AuditCheck, AuditResult, CheckStatus, DraftKind, RobotsAgentRule } from '@shared/types';
import { EmptyAudit } from '@/components/art';
import { DraftDrawer, useDraftAgent, type DraftAgent } from '@/components/drafts';
import { useProject } from '@/components/layout';
import { AGENT_CATEGORIES, CategoryBadge, StatusCodeChip } from '@/components/site';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  EmptyState,
  ErrorState,
  InfoTip,
  Input,
  Page,
  PageHeader,
  ProgressBar,
  ScoreRing,
  SkeletonCard,
  Tooltip,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, useAudits, useLatestAudit, useRunAudit } from '@/lib/api';
import { cn } from '@/lib/cn';
import { bytes, dateTime, duration, num, relativeTime } from '@/lib/format';

const P = copy.pages.readiness;
const GROUPS: AuditCheck['group'][] = ['crawlability', 'content', 'structured_data', 'ai_files', 'performance'];
const SEVERITY: Record<CheckStatus, number> = { fail: 0, warn: 1, info: 2, pass: 3 };

const STATUS_UI: Record<CheckStatus, { icon: LucideIcon; text: string; badge: 'success' | 'warning' | 'danger' | 'info' }> = {
  pass: { icon: CheckCircle2, text: 'text-success', badge: 'success' },
  warn: { icon: AlertTriangle, text: 'text-warning', badge: 'warning' },
  fail: { icon: XCircle, text: 'text-danger', badge: 'danger' },
  info: { icon: Info, text: 'text-info', badge: 'info' },
};

/** Checks the agent can draft a fix for. */
const FIX_DRAFTS: Partial<Record<string, { kind: DraftKind; params?: Record<string, string> }>> = {
  robots_ai_search: { kind: 'robots_txt' },
  robots_ai_training: { kind: 'robots_txt' },
  robots_txt: { kind: 'robots_txt' },
  llms_txt: { kind: 'llms_txt' },
  schema_present: { kind: 'schema_jsonld' },
  schema_organization: { kind: 'schema_jsonld', params: { types: 'Organization,WebSite' } },
  schema_product: { kind: 'schema_jsonld', params: { types: 'Organization,SoftwareApplication' } },
  schema_faq: { kind: 'faq_page' },
};

const RULE_UI: Record<RobotsAgentRule['allowed'], { icon: LucideIcon; cls: string }> = {
  allowed: { icon: Check, cls: 'bg-success-soft text-success border-transparent' },
  blocked: { icon: XCircle, cls: 'bg-danger-soft text-danger border-transparent' },
  partial: { icon: AlertTriangle, cls: 'bg-warning-soft text-warning border-transparent' },
  unspecified: { icon: Minus, cls: 'bg-surface text-text-muted border-border' },
};
const RULES: RobotsAgentRule['allowed'][] = ['allowed', 'partial', 'blocked', 'unspecified'];

// ---------------------------------------------------------------------------- run form

function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    setS(0);
    const t = window.setInterval(() => setS((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  return s;
}

/**
 * Same rule as the server's `normalizeAuditUrl`: bare domains ("acme.com") get https://, the result must be
 * http(s) with a dotted host. Returns the URL to send, or the inline error to show.
 */
function checkAuditUrl(raw: string): { url: string } | { error: string } {
  const v = raw.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v);
  try {
    const u = new URL(hasScheme ? v : `https://${v}`);
    if (!/^https?:$/.test(u.protocol)) return { error: P.run.invalidScheme };
    if (!u.hostname.includes('.') || /\s/.test(v)) return { error: P.run.invalidUrl };
    return { url: u.toString() };
  } catch {
    return { error: P.run.invalidUrl };
  }
}

function RunAuditCard({ hasAudit, onDone }: { hasAudit: boolean; onDone: (a: AuditResult) => void }) {
  const { projectId, project } = useProject();
  const run = useRunAudit(projectId, project.domain);
  const [url, setUrl] = useState(`https://${project.domain}/`);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const elapsed = useElapsed(run.isPending);
  const [target, setTarget] = useState(`https://${project.domain}/`);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Empty means "audit the homepage" (the server defaults to the project domain).
    if (!url.trim()) {
      setFieldError(null);
      setTarget(`https://${project.domain}/`);
      run.mutate({}, { onSuccess: onDone });
      return;
    }
    const checked = checkAuditUrl(url);
    if ('error' in checked) {
      setFieldError(checked.error);
      run.reset();
      return;
    }
    setFieldError(null);
    setTarget(checked.url);
    run.mutate({ url: checked.url }, { onSuccess: onDone });
  };

  return (
    <Card as="section" aria-label={P.run.urlLabel} className="p-4">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 md:flex-row md:items-start">
        <Input
          label={P.run.urlLabel}
          hint={run.isPending ? undefined : P.run.urlHelp}
          error={fieldError}
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          placeholder={`https://${project.domain}/`}
          disabled={run.isPending}
          wrapperClassName="flex-1"
          className="font-mono text-[13px]"
        />
        <Button type="submit" variant="primary" icon={ShieldCheck} loading={run.isPending} className="md:mt-[22px]">
          {hasAudit ? P.run.rerun : P.run.button}
        </Button>
      </form>
      {run.isPending && (
        <div className="mt-3" role="status">
          <ProgressBar indeterminate label={fmt(P.run.running, { url: target })} />
          <p className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-text-muted">
            <span className="min-w-0 truncate">{fmt(P.run.running, { url: target })}</span>
            <span className="font-mono tnum text-text-subtle">{fmt(P.run.elapsed, { seconds: elapsed })}</span>
          </p>
        </div>
      )}
      {run.isError && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <XCircle size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">{P.run.failed}.</span> {errorMessage(run.error)}
          </span>
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------- score + checks

/** The homepage check failed: nothing else on the page could be measured. */
const unreachableCheck = (a: AuditResult) => a.checks.find((c) => c.id === 'homepage_reachable' && c.status === 'fail');

function ScoreCard({ a, isLatest, onLatest }: { a: AuditResult; isLatest: boolean; onLatest: () => void }) {
  const count = (s: CheckStatus) => a.checks.filter((c) => c.status === s).length;
  const unreachable = unreachableCheck(a);
  const fixFirst = a.checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    // An unreachable homepage blocks every other check, so it always comes first.
    .sort((x, y) => Number(y === unreachable) - Number(x === unreachable) || SEVERITY[x.status] - SEVERITY[y.status] || y.weight - x.weight)
    .slice(0, 5);
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={P.score}
        titleAddon={<InfoTip term={copy.glossary.metrics.readinessScore} />}
        actions={
          a.demo ? (
            <Tooltip content={P.demoAuditTooltip}>
              <Badge tone="neutral">{copy.app.badges.demo}</Badge>
            </Tooltip>
          ) : undefined
        }
      />
      <div className="flex flex-col items-center gap-4 px-4 pb-4 pt-4 sm:flex-row xl:flex-col 2xl:flex-row">
        <ScoreRing value={a.score} tone="status" size={124} label={P.score} />
        <div className="min-w-0 space-y-3">
          <ul className="flex flex-wrap gap-1.5">
            {(['pass', 'warn', 'fail'] as const).map((s) => (
              <li key={s}>
                <Badge tone={STATUS_UI[s].badge} icon={STATUS_UI[s].icon} size="md">
                  <span className="font-mono tnum">{count(s)}</span> {copy.labels.checkStatus[s]}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-text-muted">{fmt(P.summary, { pass: count('pass'), warn: count('warn'), fail: count('fail') })}</p>
          <p className="min-w-0 text-xs text-text-subtle">
            <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 font-mono text-text-muted hover:text-accent hover:underline">
              <span className="truncate">{a.url}</span>
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden className="shrink-0" />
            </a>
            <span className="block" title={dateTime(a.createdAt)}>
              {fmt(P.run.lastRun, { time: relativeTime(a.createdAt) })}
            </span>
          </p>
        </div>
      </div>
      {unreachable && (
        <p role="alert" className="mx-4 mb-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <XCircle size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">{P.run.unreachable}</span> {unreachable.detail}
          </span>
        </p>
      )}
      {fixFirst.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h4 className="eyebrow mb-1">{P.fixFirst}</h4>
          <ul>
            {fixFirst.map((c) => {
              const ui = STATUS_UI[c.status];
              return (
                <li key={c.id}>
                  <a href={`#check-${c.id}`} className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text transition-colors hover:bg-surface-2">
                    <ui.icon size={14} strokeWidth={1.75} aria-hidden className={cn('shrink-0', ui.text)} />
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <span className="sr-only">{copy.labels.checkStatus[c.status]}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!isLatest && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-info-soft px-4 py-2.5 text-xs text-info">
          <span>{fmt(P.viewing, { date: dateTime(a.createdAt) })}</span>
          <button type="button" onClick={onLatest} className="font-medium hover:underline">
            {P.backToLatest}
          </button>
        </div>
      )}
    </Card>
  );
}

function CheckRow({ c, agent }: { c: AuditCheck; agent: DraftAgent }) {
  const ui = STATUS_UI[c.status];
  const fix = c.status === 'warn' || c.status === 'fail' ? FIX_DRAFTS[c.id] : undefined;
  return (
    <li id={`check-${c.id}`} className="flex scroll-mt-24 gap-3 px-4 py-3 target:bg-primary-soft">
      <ui.icon size={16} strokeWidth={1.75} aria-hidden className={cn('mt-0.5 shrink-0', ui.text)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h4 className="text-[13px] font-semibold text-text">{c.title}</h4>
          <span className={cn('text-2xs font-semibold', ui.text)}>{copy.labels.checkStatus[c.status]}</span>
        </div>
        <p className="mt-0.5 break-words text-[13px] leading-5 text-text-muted">{c.detail}</p>
        {c.fix && c.status !== 'pass' && (
          <div className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-[13px] leading-5 text-text">
            <span className="eyebrow mr-1.5">{P.check.fix}</span>
            {c.fix}
          </div>
        )}
        {fix && (
          <Button
            size="sm"
            icon={FilePen}
            className="mt-2"
            loading={agent.pendingKey === `check:${c.id}`}
            disabled={!!agent.pendingKey}
            onClick={() => agent.draft({ kind: fix.kind, params: fix.params }, `check:${c.id}`)}
          >
            {P.check.draftFix}
          </Button>
        )}
      </div>
    </li>
  );
}

function ChecksCard({ a, agent }: { a: AuditResult; agent: DraftAgent }) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader title={P.sections.checks} subtitle={plural(a.checks.length, P.checksCount)} />
      <div className="mt-3 divide-y divide-border border-t border-border">
        {GROUPS.map((g) => {
          const list = a.checks.filter((c) => c.group === g).sort((x, y) => SEVERITY[x.status] - SEVERITY[y.status] || y.weight - x.weight);
          if (!list.length) return null;
          const passed = list.filter((c) => c.status === 'pass').length;
          return (
            <section key={g} aria-label={copy.labels.auditGroup[g]}>
              <div className="flex items-center justify-between gap-3 bg-surface-2/60 px-4 py-2">
                <h3 className="eyebrow">{copy.labels.auditGroup[g]}</h3>
                <span className="font-mono text-2xs text-text-subtle tnum">{fmt(P.groupSummary, { pass: passed, total: list.length })}</span>
              </div>
              <ul className="divide-y divide-border">
                {list.map((c) => (
                  <CheckRow key={c.id} c={c} agent={agent} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- robots matrix

function RobotsCard({ a, agent }: { a: AuditResult; agent: DraftAgent }) {
  const R = P.robots;
  const agents = a.robots.agents;
  const counts = Object.fromEntries(RULES.map((r) => [r, agents.filter((x) => x.allowed === r).length])) as Record<RobotsAgentRule['allowed'], number>;
  return (
    <Card className="flex flex-col xl:col-span-2">
      <CardHeader
        title={P.sections.robots}
        titleAddon={<InfoTip term={copy.glossary.site.robotsAiRules} />}
        subtitle={P.sections.robotsBody}
        actions={
          <Button size="sm" icon={FilePen} loading={agent.pendingKey === 'robots'} disabled={!!agent.pendingKey} onClick={() => agent.draft({ kind: 'robots_txt' }, 'robots')}>
            {R.draft}
          </Button>
        }
      />
      <div className="px-4 pb-4 pt-3">
        {!a.robots.found && (
          <p className="mb-3 flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
            <Info size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            {unreachableCheck(a) ? R.unreachable : R.notFound}
          </p>
        )}
        <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-muted" aria-label={R.legend}>
          {RULES.map((r) => {
            const Icon = RULE_UI[r].icon;
            return (
              <li key={r} className="inline-flex items-center gap-1.5">
                <span className={cn('inline-flex size-4 items-center justify-center rounded-sm border', RULE_UI[r].cls)}>
                  <Icon size={11} strokeWidth={2.25} aria-hidden />
                </span>
                {copy.labels.robotsRule[r]}
                <span className="font-mono text-text-subtle tnum">{counts[r]}</span>
              </li>
            );
          })}
        </ul>
        <div className="divide-y divide-border rounded-lg border border-border">
          {AGENT_CATEGORIES.map((cat) => {
            const list = agents.filter((x) => x.category === cat);
            if (!list.length) return null;
            return (
              <div key={cat} className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-start md:gap-4">
                <div className="md:w-40 md:shrink-0 md:pt-1">
                  <CategoryBadge category={cat} info />
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {list.map((x) => {
                    const ui = RULE_UI[x.allowed];
                    return (
                      <li key={x.agentId}>
                        <Tooltip content={`${x.agentName} · ${x.operator} · ${copy.labels.robotsRule[x.allowed]}`}>
                          <span tabIndex={0} className={cn('inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium', ui.cls)}>
                            <ui.icon size={12} strokeWidth={2.25} aria-hidden />
                            {x.agentName}
                            <span className="sr-only">: {copy.labels.robotsRule[x.allowed]}</span>
                          </span>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {a.robots.sitemaps.length > 0 && (
        <div className="mt-auto border-t border-border px-4 py-3 text-xs text-text-muted">
          <span className="font-medium text-text">{plural(a.robots.sitemaps.length, R.sitemaps)}</span>
          <span className="ml-2 font-mono text-text-subtle">{a.robots.sitemaps.slice(0, 3).join(' · ')}</span>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------- side cards

function LlmsTxtCard({ a, agent }: { a: AuditResult; agent: DraftAgent }) {
  const L = P.llmsTxt;
  const l = a.llmsTxt;
  return (
    <Card>
      <CardHeader
        title={P.sections.llmsTxt}
        titleAddon={<InfoTip term={copy.glossary.site.llmsTxt} />}
        actions={l.found ? <Badge tone="success" icon={CheckCircle2}>{copy.labels.checkStatus.pass}</Badge> : <Badge tone="danger" icon={XCircle}>{P.missing}</Badge>}
      />
      <div className="space-y-3 p-4">
        <p className="text-[13px] text-text-muted">{l.found ? fmt(L.found, { url: l.url, bytes: bytes(l.bytes) }) : L.notFound}</p>
        {l.found && l.preview && <CodeBlock code={l.preview} title={L.preview} language="llms.txt" maxHeight={220} wrap />}
        <Button size="sm" icon={FilePen} loading={agent.pendingKey === 'llms'} disabled={!!agent.pendingKey} onClick={() => agent.draft({ kind: 'llms_txt' }, 'llms')}>
          {L.draft}
        </Button>
      </div>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 px-4 py-2.5 text-[13px]">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </div>
  );
}

function PageFactsCard({ a }: { a: AuditResult }) {
  const F = P.page;
  const p = a.page;
  const missing = <span className="text-text-subtle">{F.missing}</span>;
  const og = Object.entries(p.ogTags);
  return (
    <Card>
      <CardHeader title={P.sections.page} />
      <dl className="mt-2 divide-y divide-border border-t border-border">
        <Fact label={F.title}>{p.title || missing}</Fact>
        <Fact label={F.metaDescription}>{p.metaDescription || missing}</Fact>
        <Fact label={F.h1}>
          {p.h1.length ? (
            <ul className="space-y-0.5">
              {p.h1.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          ) : (
            missing
          )}
        </Fact>
        <Fact label={F.wordCount}>
          <span className="font-mono tnum">{num(p.wordCount)}</span>
        </Fact>
        <Fact label={F.schemaTypes}>
          {p.schemaTypes.length ? (
            <span className="flex flex-wrap gap-1">
              {p.schemaTypes.map((t) => (
                <Badge key={t} tone="neutral" className="font-mono">
                  {t}
                </Badge>
              ))}
            </span>
          ) : (
            missing
          )}
        </Fact>
        <Fact label={F.ogTags}>
          {og.length ? (
            <ul className="space-y-1">
              {og.map(([k, v]) => (
                <li key={k} className="min-w-0">
                  <span className="font-mono text-xs text-text-subtle">{k}</span> <span className="line-clamp-2">{v}</span>
                </li>
              ))}
            </ul>
          ) : (
            missing
          )}
        </Fact>
        <Fact label={F.canonical}>{p.canonical ? <span className="font-mono text-xs">{p.canonical}</span> : missing}</Fact>
        <Fact label={F.lang}>{p.lang ? <span className="font-mono">{p.lang}</span> : missing}</Fact>
        <Fact label={F.statusCode}>
          <StatusCodeChip status={p.statusCode} />
        </Fact>
        <Fact label={F.responseMs}>
          <span className="font-mono tnum">{duration(p.responseMs)}</span>
        </Fact>
      </dl>
    </Card>
  );
}

function HistoryCard({ audits, current, latestId, onSelect }: { audits: AuditResult[]; current: string; latestId: string | undefined; onSelect: (id: string) => void }) {
  return (
    <Card>
      <CardHeader title={P.sections.history} />
      {audits.length <= 1 ? (
        <p className="px-4 pb-4 pt-2 text-[13px] text-text-subtle">{P.historyEmpty}</p>
      ) : (
        <ul className="mt-2 max-h-80 divide-y divide-border overflow-y-auto border-t border-border">
          {audits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onSelect(h.id)}
                aria-current={h.id === current || undefined}
                className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2', h.id === current && 'bg-primary-soft hover:bg-primary-soft')}
              >
                <ScoreRing value={h.score} tone="status" size={36} thickness={4} caption={null} label={P.score} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-text">{h.url}</span>
                  <span className="block text-xs text-text-subtle">{fmt(P.historyItem, { score: h.score, date: dateTime(h.createdAt) })}</span>
                </span>
                {h.id === latestId && <Badge tone="neutral">{P.latest}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------- page

export default function ReadinessPage() {
  const { projectId, project } = useProject();
  const latest = useLatestAudit(projectId);
  const audits = useAudits(projectId);
  const agent = useDraftAgent(projectId);
  const [viewId, setViewId] = useState<string | null>(null);
  const shown = useMemo(() => (viewId ? (audits.data?.find((a) => a.id === viewId) ?? latest.data) : latest.data), [viewId, audits.data, latest.data]);
  const isLatest = !shown || shown.id === latest.data?.id;

  return (
    <Page>
      <PageHeader title={P.title} subtitle={P.subtitle} className="mb-0" />
      {/* Show the audit that just ran, even when it's another site's page (it doesn't replace your site's latest). */}
      <RunAuditCard hasAudit={!!latest.data} onDone={(a) => setViewId(a.id === latest.data?.id ? null : a.id)} />
      {latest.isLoading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" aria-busy="true">
          <SkeletonCard height={180} />
          <SkeletonCard height={180} className="xl:col-span-2" />
        </div>
      ) : latest.isError ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={latest.error} onRetry={() => void latest.refetch()} retrying={latest.isFetching} />
      ) : !shown ? (
        <EmptyState bordered size="lg" illustration={<EmptyAudit width={180} />} title={P.empty.title} body={fmt(P.empty.body, { domain: project.domain })} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ScoreCard a={shown} isLatest={isLatest} onLatest={() => setViewId(null)} />
            <RobotsCard a={shown} agent={agent} />
          </div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
            <ChecksCard a={shown} agent={agent} />
            <div className="space-y-4">
              <LlmsTxtCard a={shown} agent={agent} />
              <PageFactsCard a={shown} />
              <HistoryCard audits={audits.data ?? []} current={shown.id} latestId={latest.data?.id} onSelect={(id) => setViewId(id === latest.data?.id ? null : id)} />
            </div>
          </div>
        </div>
      )}
      <DraftDrawer {...agent.drawerProps} />
    </Page>
  );
}
