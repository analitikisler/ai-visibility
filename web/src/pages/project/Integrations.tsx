// Integrations: get AI crawler and AI referral data into ai visibility (server snippets, referral script,
// log upload, ingest API with a test event) and browse the catalog of AI agents we recognize.
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, LockKeyhole, Minus, RefreshCw, Search, Send, XCircle } from 'lucide-react';
import type { AgentCategory, AiAgent } from '@shared/types';
import { useProject } from '@/components/layout';
import { AGENT_CATEGORIES, CategoryBadge, LogUploadForm } from '@/components/site';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  ConfirmDialog,
  CopyButton,
  Dot,
  ErrorState,
  Input,
  Page,
  PageHeader,
  Select,
  SkeletonCard,
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
  useTabParam,
} from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { errorMessage, http, isApiError, useAgents, useIntegration, useRotateIngestToken } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime, relativeTime } from '@/lib/format';

const P = copy.pages.integrations;
const S = P.sections;
const TEST_UA = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)';
const TEST_PATH = '/ai-visibility-test-event';

interface IngestResult {
  accepted: number;
  bots: number;
  referrals: number;
  skipped?: number;
}

function Section({ title, body, children, className }: { title: string; body?: string; children: ReactNode; className?: string }) {
  return (
    <Card as="section" aria-label={title} className={className}>
      <CardHeader title={title} subtitle={body} />
      <div className="p-4">{children}</div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- status rail

/** The secret ingest token: masked by default, with copy and an "issue new token" confirm. */
function IngestTokenBlock({ token }: { token: string }) {
  const { projectId } = useProject();
  const rotate = useRotateIngestToken(projectId);
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const masked = `${token.slice(0, 6)}${'•'.repeat(Math.max(0, Math.min(24, token.length - 6)))}`;
  return (
    <div className="border-t border-border px-4 py-4">
      <div className="flex items-center gap-1.5">
        <LockKeyhole size={14} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
        <h3 className="eyebrow">{S.ingestToken}</h3>
      </div>
      <div className="mt-2 flex items-center gap-1 rounded-md border border-border bg-surface-2 py-1 pl-3 pr-1">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{shown ? token : masked}</code>
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? S.hideToken : S.showToken}
          title={shown ? S.hideToken : S.showToken}
          className="inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text"
        >
          {shown ? <EyeOff size={14} strokeWidth={1.75} aria-hidden /> : <Eye size={14} strokeWidth={1.75} aria-hidden />}
        </button>
        <CopyButton text={token} label={copy.common.copy} />
      </div>
      <p className="mt-2 text-xs text-text-subtle">{S.ingestTokenBody}</p>
      <Button className="mt-3" size="sm" variant="ghost" icon={RefreshCw} onClick={() => setConfirming(true)}>
        {S.rotateToken}
      </Button>
      {rotate.isSuccess && !confirming && (
        <p role="status" className="mt-2 flex items-start gap-1.5 text-[13px] text-success">
          <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          <span>{S.rotated}</span>
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => rotate.mutate(undefined, { onSettled: () => setConfirming(false) })}
        title={S.rotateTitle}
        body={S.rotateBody}
        confirmLabel={S.rotateConfirm}
        cancelLabel={copy.common.cancel}
        loading={rotate.isPending}
      />
    </div>
  );
}

function StatusCard({ siteKey, ingestToken, lastEventAt }: { siteKey: string; ingestToken: string; lastEventAt: string | null }) {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const test = useMutation({
    mutationFn: () => http.post<IngestResult>(
      `/ingest/${encodeURIComponent(siteKey)}`,
      { path: TEST_PATH, userAgent: TEST_UA, status: 200, ts: new Date().toISOString() },
      { Authorization: `Bearer ${ingestToken}` },
    ),
    onSuccess: () => {
      for (const part of ['crawlers', 'integration', 'report']) void qc.invalidateQueries({ queryKey: ['p', projectId, part] });
    },
  });
  const receiving = !!lastEventAt;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className={cn('mt-1.5 inline-flex size-2.5 shrink-0 rounded-full', receiving ? 'bg-success' : 'bg-text-subtle')} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">{receiving ? P.receivingTitle : P.waitingTitle}</p>
          <p className="mt-0.5 text-[13px] text-text-muted" title={lastEventAt ? dateTime(lastEventAt) : undefined}>
            {receiving ? fmt(P.lastEvent, { time: relativeTime(lastEventAt) }) : P.status.waiting}
          </p>
        </div>
      </div>
      <div className="mt-4 border-t border-border px-4 py-4">
        <div className="flex items-center gap-1.5">
          <KeyRound size={14} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
          <h3 className="eyebrow">{S.siteKey}</h3>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-surface-2 py-1 pl-3 pr-1">
          <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{siteKey}</code>
          <CopyButton text={siteKey} label={copy.common.copy} />
        </div>
        <p className="mt-2 text-xs text-text-subtle">{S.siteKeyBody}</p>
      </div>
      <IngestTokenBlock token={ingestToken} />
      <div className="mt-auto border-t border-border px-4 py-4">
        <p className="text-[13px] text-text-muted">{P.testBody}</p>
        <Button className="mt-3" icon={Send} loading={test.isPending} onClick={() => test.mutate()}>
          {P.sendTest}
        </Button>
        {test.isSuccess && (
          <p role="status" className="mt-3 flex items-start gap-1.5 text-[13px] text-success">
            <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {P.testSent} {fmt(P.testDetail, { bots: test.data.bots, path: TEST_PATH })}
            </span>
          </p>
        )}
        {test.isError &&
          // 429 = the site key's ingest rate limit: the pipe works, the button was just pressed too often.
          (isApiError(test.error) && test.error.status === 429 ? (
            <p role="status" className="mt-3 flex items-start gap-1.5 text-[13px] text-warning">
              <AlertTriangle size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
              <span>{P.testRateLimited}</span>
            </p>
          ) : (
            <p role="alert" className="mt-3 flex items-start gap-1.5 text-[13px] text-danger">
              <XCircle size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                {P.testFailed} <span className="text-text-muted">{fmt(copy.app.errors.detail, { detail: errorMessage(test.error) })}</span>
              </span>
            </p>
          ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- snippets

function ServerSnippets({ snippets }: { snippets: { id: string; name: string; language: string; code: string }[] }) {
  const ids = snippets.map((s) => s.id);
  const [tab, setTab] = useTabParam('snippet', ids, ids[0] ?? '');
  const current = snippets.find((s) => s.id === tab) ?? snippets[0];
  if (!current) return null;
  return (
    <div>
      <Tabs idBase="snippets" label={P.snippetTabs} value={current.id} onValueChange={setTab} items={snippets.map((s) => ({ value: s.id, label: s.name }))} />
      <TabPanel idBase="snippets" value={current.id} className="pt-3">
        <CodeBlock code={current.code} title={current.name} language={current.language} maxHeight={380} />
      </TabPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------- agent catalog

function AgentCatalog() {
  const agents = useAgents();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | AgentCategory>('all');
  const C = P.catalogColumns;
  const order = (c: AgentCategory) => AGENT_CATEGORIES.indexOf(c);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (agents.data ?? [])
      .filter((a) => category === 'all' || a.category === category)
      .filter((a) => !q || [a.name, a.operator, a.product ?? '', ...a.robotsTokens].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => order(a.category) - order(b.category) || a.operator.localeCompare(b.operator) || a.name.localeCompare(b.name));
  }, [agents.data, query, category]);

  return (
    <Card as="section" aria-label={S.catalog}>
      <CardHeader title={S.catalog} subtitle={agents.data ? fmt(S.catalogBody, { count: agents.data.length }) : undefined} />
      <div className="flex flex-col gap-2 px-4 pt-3 sm:flex-row">
        <Input label={copy.common.search} hideLabel icon={Search} placeholder={P.searchAgents} value={query} onChange={(e) => setQuery(e.target.value)} wrapperClassName="sm:max-w-xs sm:flex-1" type="search" />
        <Select<'all' | AgentCategory>
          label={C.category}
          hideLabel
          value={category}
          onChange={setCategory}
          wrapperClassName="sm:w-48"
          options={[{ value: 'all', label: copy.pages.crawlers.filters.allCategories }, ...AGENT_CATEGORIES.map((c) => ({ value: c, label: copy.labels.agentCategory[c] }))]}
        />
      </div>
      <div className="mt-3">
        {agents.isError ? (
          <ErrorState size="sm" error={agents.error} onRetry={() => void agents.refetch()} />
        ) : (
          <Table aria-label={S.catalog} maxHeight={560}>
            <THead>
              <tr>
                <Th>{C.name}</Th>
                <Th className="hidden md:table-cell">{C.operator}</Th>
                <Th className="hidden sm:table-cell">{C.category}</Th>
                <Th className="hidden lg:table-cell">{C.tokens}</Th>
                <Th>{C.respects}</Th>
                <Th className="w-0 text-right">{C.docs}</Th>
              </tr>
            </THead>
            <TBody>
              {agents.isLoading ? (
                <TableEmpty colSpan={6}>{copy.app.loading.default}</TableEmpty>
              ) : rows.length === 0 ? (
                <TableEmpty colSpan={6}>{P.noAgentsMatch}</TableEmpty>
              ) : (
                rows.map((a) => <AgentRow key={a.id} a={a} />)
              )}
            </TBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

function AgentRow({ a }: { a: AiAgent }) {
  const C = P.catalogColumns;
  return (
    <Tr>
      <Td className="max-w-[16rem]">
        <Tooltip content={a.description} side="right">
          <span tabIndex={0} className="block min-w-0 rounded-sm">
            <span className="block truncate font-medium text-text">{a.name}</span>
            {a.product && <span className="block truncate text-xs text-text-subtle">{a.product}</span>}
          </span>
        </Tooltip>
      </Td>
      <Td muted className="hidden whitespace-nowrap md:table-cell">
        {a.operator}
      </Td>
      <Td className="hidden sm:table-cell">
        <CategoryBadge category={a.category} />
      </Td>
      <Td className="hidden lg:table-cell">
        <span className="flex flex-wrap gap-1">
          {a.robotsTokens.length ? (
            a.robotsTokens.map((t) => (
              <Badge key={t} tone="neutral" className="font-mono normal-case">
                {t}
              </Badge>
            ))
          ) : (
            <span className="text-text-subtle">—</span>
          )}
          {!a.uaDetectable && (
            <Tooltip content={P.robotsOnlyTooltip}>
              <span tabIndex={0} className="inline-flex rounded-sm">
                <Badge tone="outline">{P.robotsOnly}</Badge>
              </span>
            </Tooltip>
          )}
        </span>
      </Td>
      <Td className="whitespace-nowrap">
        {a.respectsRobots ? (
          <span className="inline-flex items-center gap-1 text-[13px] text-success">
            <Check size={14} strokeWidth={2} aria-hidden />
            {P.yes}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[13px] text-text-muted">
            <Minus size={14} strokeWidth={2} aria-hidden />
            {P.no}
          </span>
        )}
      </Td>
      <Td className="text-right">
        {a.docsUrl ? (
          <a href={a.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text" aria-label={`${a.name} ${C.docs}`} title={a.docsUrl}>
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          </a>
        ) : (
          <span className="text-text-subtle">—</span>
        )}
      </Td>
    </Tr>
  );
}

// ---------------------------------------------------------------------------- page

export default function IntegrationsPage() {
  const { projectId } = useProject();
  const q = useIntegration(projectId);
  const info = q.data;
  const server = info?.snippets.filter((s) => s.id !== 'pixel') ?? [];
  const example = info
    ? `curl -X POST ${info.ingestUrl} \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer ${info.ingestToken}' \\\n  -d '{"path": "/pricing", "userAgent": "${TEST_UA}", "status": 200}'`
    : '';

  return (
    <Page>
      <PageHeader title={P.title} subtitle={P.subtitle} className="mb-0" />
      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" aria-busy="true">
          <SkeletonCard height={320} className="xl:col-span-2" />
          <SkeletonCard height={320} />
        </div>
      ) : q.isError || !info ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
            <div className="order-2 space-y-4 xl:order-1 xl:col-span-2">
              <Section title={S.server} body={S.serverBody}>
                <ServerSnippets snippets={server} />
              </Section>
              <Section title={S.pixel} body={S.pixelBody}>
                <CodeBlock code={info.pixelScript} title="HTML" language="html" wrap />
              </Section>
              <Section title={S.log} body={S.logBody}>
                <LogUploadForm projectId={projectId} />
              </Section>
              <Section title={S.api} body={S.apiBody}>
                <div className="space-y-3">
                  <div>
                    <h4 className="eyebrow mb-1.5">{P.ingestUrl}</h4>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 py-1 pl-3 pr-1">
                      <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">
                        <span className="mr-2 text-text-subtle">POST</span>
                        {info.ingestUrl}
                      </code>
                      <CopyButton text={info.ingestUrl} label={copy.common.copy} />
                    </div>
                  </div>
                  <CodeBlock code={example} title={P.exampleRequest} language="bash" />
                </div>
              </Section>
            </div>
            <div className="order-1 space-y-4 xl:sticky xl:top-20 xl:order-2">
              <StatusCard siteKey={info.siteKey} ingestToken={info.ingestToken} lastEventAt={info.lastEventAt} />
              <Card className="p-4">
                <h3 className="eyebrow">{P.pickTitle}</h3>
                <ul className="mt-3 space-y-2.5 text-[13px] leading-5 text-text-muted">
                  {P.pickSteps.map((s, i) => (
                    <li key={i} className="flex gap-2.5">
                      <Dot color="var(--color-border-strong)" size={6} className="mt-[7px]" />
                      <span>
                        <span className="font-medium text-text">{s.title}</span> {s.body}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
          <AgentCatalog />
        </>
      )}
    </Page>
  );
}
