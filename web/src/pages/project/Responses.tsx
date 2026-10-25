// Answers explorer: every collected AI answer, filterable (engine + period from the top bar; named,
// tier, prompt and text search here), all synced to the URL. Click an answer for the full transcript.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { PromptTier } from '@shared/types';
import { AnswerCard, AnswerListItem, RunCheckEmpty, useAnswerEntities, useAnswers } from '@/components/answers';
import { useProject } from '@/components/layout';
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  Page,
  PageHeader,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
} from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { usePrompts, useResponse } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFilters } from '@/lib/filters';
import { num } from '@/lib/format';

const R = copy.pages.responses;
const PAGE_SIZE = 20;
const TIERS: PromptTier[] = ['must_win', 'core', 'foundational'];
type Named = 'all' | 'named' | 'not';

/** Page-level filters in the URL (`?named=1&tier=core&prompt=…&q=…&page=2&answer=…`). */
function useAnswerParams() {
  const [sp, setSp] = useSearchParams();
  const rawTier = sp.get('tier');
  const tier = TIERS.includes(rawTier as PromptTier) ? (rawTier as PromptTier) : undefined;
  const named: Named = sp.get('named') === '1' ? 'named' : sp.get('named') === '0' ? 'not' : 'all';
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1);
  const set = (patch: Record<string, string | null>, opts: { keepPage?: boolean } = {}) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!opts.keepPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  return {
    tier,
    named,
    promptId: sp.get('prompt') ?? '',
    q: sp.get('q') ?? '',
    domain: sp.get('domain') ?? '',
    page,
    answerId: sp.get('answer'),
    set,
  };
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2" aria-busy="true" aria-label={fmt(copy.app.loading.page, { page: R.title })}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export default function ResponsesPage() {
  const { projectId } = useProject();
  const { days, engine, setEngine } = useFilters();
  const f = useAnswerParams();
  const prompts = usePrompts(projectId);
  const entities = useAnswerEntities();

  // Debounced search: the box updates instantly, the URL (and query) 300ms after typing stops.
  const [qDraft, setQDraft] = useState(f.q);
  useEffect(() => {
    if (f.q !== qDraft.trim()) setQDraft(f.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.q]);
  useEffect(() => {
    if (qDraft.trim() === f.q) return;
    const t = window.setTimeout(() => f.set({ q: qDraft.trim() || null }), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  const offset = (f.page - 1) * PAGE_SIZE;
  const answers = useAnswers(projectId, {
    days,
    engine,
    tier: f.tier,
    promptId: f.promptId || undefined,
    mentioned: f.named === 'all' ? undefined : f.named === 'named',
    q: f.q || undefined,
    citedDomain: f.domain || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const items = answers.data?.items ?? [];
  const total = answers.data?.total ?? 0;

  // A page past the end (e.g. after narrowing a filter) snaps back to the last page.
  useEffect(() => {
    if (answers.data && !answers.isPlaceholderData && total > 0 && offset >= total) f.set({ page: String(Math.ceil(total / PAGE_SIZE)) }, { keepPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.data, answers.isPlaceholderData, total, offset]);

  const hasLocalFilters = !!(f.tier || f.promptId || f.q || f.domain || f.named !== 'all');
  const clearAll = () => {
    setQDraft('');
    f.set({ tier: null, prompt: null, q: null, named: null, domain: null });
    if (engine) setEngine(null);
  };

  const promptOptions = useMemo(
    () => [
      { value: '', label: R.filters.allPrompts },
      ...(prompts.data ?? []).map((p) => ({ value: p.id, label: p.text.length > 80 ? `${p.text.slice(0, 78)}…` : p.text })),
    ],
    [prompts.data],
  );

  // Drawer: the open answer comes from the current page when possible, else from GET /responses/:id.
  const idx = items.findIndex((a) => a.id === f.answerId);
  const single = useResponse(idx < 0 ? f.answerId : null);
  const open = idx >= 0 ? items[idx] : single.data;
  const go = (id: string | null) => f.set({ answer: id }, { keepPage: true });

  const filters = (
    <Card className="p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label={R.search}
          hideLabel
          icon={Search}
          type="search"
          className="[&::-webkit-search-cancel-button]:hidden"
          placeholder={R.searchPlaceholder}
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') f.set({ q: qDraft.trim() || null });
          }}
          wrapperClassName="min-w-56 flex-[2_1_16rem]"
          trailing={
            qDraft ? (
              <button type="button" aria-label={copy.common.clearFilters} onClick={() => setQDraft('')} className="rounded-sm p-0.5 hover:text-text">
                <X size={14} strokeWidth={1.75} aria-hidden />
              </button>
            ) : undefined
          }
        />
        <SegmentedControl<Named>
          label={R.namedFilter.label}
          size="md"
          value={f.named}
          onChange={(v) => f.set({ named: v === 'all' ? null : v === 'named' ? '1' : '0' })}
          options={[
            { value: 'all', label: R.namedFilter.all },
            { value: 'named', label: R.namedFilter.named },
            { value: 'not', label: R.namedFilter.notNamed },
          ]}
        />
        <Select<string>
          label={copy.filters.tier.label}
          hideLabel
          value={f.tier ?? ''}
          onChange={(v) => f.set({ tier: v || null })}
          options={[{ value: '', label: copy.filters.tier.all }, ...TIERS.map((t) => ({ value: t, label: copy.labels.tier[t] }))]}
          wrapperClassName="w-36 shrink-0"
        />
        <Select<string>
          label={R.filters.prompt}
          hideLabel
          value={f.promptId}
          onChange={(v) => f.set({ prompt: v || null })}
          options={promptOptions}
          wrapperClassName="min-w-48 flex-[1_1_14rem]"
        />
        {f.domain && (
          <Button variant="secondary" icon={X} onClick={() => f.set({ domain: null })} aria-label={`${fmt(R.filters.citing, { domain: f.domain })} · ${copy.common.clearFilters}`}>
            {fmt(R.filters.citing, { domain: f.domain })}
          </Button>
        )}
        {(hasLocalFilters || engine) && (
          <Button variant="ghost" icon={X} onClick={clearAll}>
            {copy.common.clearFilters}
          </Button>
        )}
      </div>
    </Card>
  );

  const nothingYet = !!answers.data && total === 0 && !hasLocalFilters && !engine;
  let body;
  if (answers.isLoading) body = <ListSkeleton />;
  else if (answers.isError)
    body = <ErrorState bordered title={copy.app.errors.generic.title} error={answers.error} onRetry={() => void answers.refetch()} retrying={answers.isFetching} />;
  else if (nothingYet) body = <RunCheckEmpty title={R.empty.title} body={R.empty.body} cta={R.empty.cta} />;
  else if (total === 0)
    body = (
      <EmptyState
        bordered
        icon={Search}
        title={R.filteredEmpty.title}
        body={R.filteredEmpty.body}
        action={
          <Button variant="primary" onClick={clearAll}>
            {R.filteredEmpty.cta}
          </Button>
        }
      />
    );
  else
    body = (
      <div className={cn('space-y-3 transition-opacity duration-160', answers.isPlaceholderData && 'opacity-60')}>
        <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={(o) => f.set({ page: String(o / PAGE_SIZE + 1) })} busy={answers.isFetching} />
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((a) => (
            <li key={a.id} className="min-w-0">
              <AnswerListItem answer={a} onOpen={() => go(a.id)} selected={a.id === f.answerId} hidePrompt={!!f.promptId} entities={entities} />
            </li>
          ))}
        </ul>
        <Pagination
          total={total}
          limit={PAGE_SIZE}
          offset={offset}
          onOffsetChange={(o) => {
            f.set({ page: String(o / PAGE_SIZE + 1) });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          busy={answers.isFetching}
        />
      </div>
    );

  return (
    <Page>
      <PageHeader title={R.title} subtitle={R.subtitle} className="mb-0" />
      {!nothingYet && filters}
      {body}

      <Drawer
        open={!!f.answerId}
        onClose={() => go(null)}
        title={R.detail.title}
        description={idx >= 0 ? fmt(R.position, { index: num(offset + idx + 1), total: num(total) }) : undefined}
        widthClass="max-w-2xl"
        footer={
          idx >= 0 ? (
            <div className="flex w-full items-center justify-between gap-2">
              <Button icon={ChevronLeft} disabled={idx <= 0} onClick={() => go(items[idx - 1]!.id)}>
                {R.detail.prev}
              </Button>
              <Button iconRight={ChevronRight} disabled={idx >= items.length - 1} onClick={() => go(items[idx + 1]!.id)}>
                {R.detail.next}
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="p-5">
          {open ? (
            <AnswerCard answer={open} bare entities={entities} />
          ) : single.isError ? (
            <ErrorState size="sm" error={single.error} onRetry={() => void single.refetch()} />
          ) : (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </div>
      </Drawer>
    </Page>
  );
}
