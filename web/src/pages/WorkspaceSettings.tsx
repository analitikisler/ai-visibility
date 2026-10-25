// Workspace settings: API keys per engine (masked, set / replace / remove), usage & budget (estimated live
// spend, monthly cap, scheduled-check mode, same-day reuse), model overrides and the analysis engine.
// Keys live in the app's local database; the server only ever returns them masked.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, DollarSign, FlaskConical, Info, KeyRound, Lock, PauseCircle, PiggyBank, RotateCcw, Trash2, type LucideIcon } from 'lucide-react';
import type { CostSettings, EngineId, EngineInfo, RunMode, SettingsUpdate, SettingsView, UsageView } from '@shared/types';
import { StackedAreaChart } from '@/components/charts';
import {
  Button,
  Card,
  CardFooter,
  CardHeader,
  ConfirmDialog,
  EngineBadge,
  ErrorState,
  Input,
  ModeBadge,
  Page,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonCard,
  Switch,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr,
  useSort,
  useToast,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { cn } from '@/lib/cn';
import { BRAND_COLOR } from '@/lib/colors';
import { errorMessage, isNotFound, useEngines, useSettings, useUpdateSettings, useUsage } from '@/lib/api';
import { dayLabel, num, pct, usd } from '@/lib/format';

const W = copy.pages.workspaceSettings;
const U = W.usage;

/** `OPENAI_API_KEY` → `OPENAI_MODEL` (the server's model-override setting for the same engine). */
const modelSetting = (e: EngineInfo) => e.keySetting.replace(/_API_KEY$/, '_MODEL');

function useSave() {
  const update = useUpdateSettings();
  const toast = useToast();
  /** `onError` shows the server's message next to the field instead of in a toast. */
  return (body: SettingsUpdate, success: string, done?: (s: SettingsView) => void, onError?: (message: string) => void) =>
    update.mutateAsync(body).then(
      (s) => {
        toast.success(success);
        done?.(s);
      },
      (e) => (onError ? onError(errorMessage(e)) : toast.error(copy.app.errors.saveFailed, errorMessage(e))),
    );
}

function KeyRow({ engine, masked }: { engine: EngineInfo; masked: string | null }) {
  const save = useSave();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // A rejected key (spaces, control characters…) gets the server's reason under the field, not a toast.
  const [error, setError] = useState<string | null>(null);
  const K = W.key;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    setError(null);
    // Validation errors arrive as "keys.OPENAI_API_KEY: <reason>": the field already says which key, so drop the path.
    const onError = (msg: string) => setError(msg.replace(/^keys\.\w+:\s*/, ''));
    void save({ keys: { [engine.keySetting]: v } }, fmt(K.saved, { engine: engine.name }), () => setValue(''), onError).finally(() => setBusy(false));
  };
  const remove = () => {
    setBusy(true);
    void save({ keys: { [engine.keySetting]: null } }, fmt(K.removed, { engine: engine.name }), () => setConfirm(false)).finally(() => setBusy(false));
  };
  return (
    <li className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <EngineBadge engine={engine.id} showVendor={engine.vendor !== engine.name} />
          <ModeBadge mode={engine.mode} engineName={engine.name} />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-text-subtle">
          <Lock size={12} strokeWidth={1.75} aria-hidden />
          {masked ? (
            <span>
              {fmt(K.masked, { masked: '' })}
              <span className="font-mono text-text-muted">{masked}</span>
            </span>
          ) : (
            K.notSet
          )}
        </p>
      </div>
      <form onSubmit={submit} className="flex min-w-0 flex-wrap items-start gap-2">
        <Input
          label={fmt(K.label, { vendor: engine.vendor })}
          hideLabel
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={masked ? K.replace : K.placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          error={error}
          className="font-mono"
          wrapperClassName="min-w-48 flex-1"
          maxLength={500}
        />
        <Button type="submit" icon={KeyRound} disabled={!value.trim()} loading={busy && !!value}>
          {masked ? K.replace : K.save}
        </Button>
        {masked && (
          <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
            {K.remove}
          </Button>
        )}
      </form>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        loading={busy}
        title={fmt(W.removeDialog.title, { vendor: engine.vendor })}
        body={fmt(W.removeDialog.body, { engine: engine.name })}
        confirmLabel={W.removeDialog.confirm}
        cancelLabel={W.removeDialog.cancel}
      />
    </li>
  );
}

function ModelRow({ engine, current }: { engine: EngineInfo; current: string }) {
  const save = useSave();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [current]);
  const key = modelSetting(engine);
  const run = (v: string, msg: string) => {
    setBusy(true);
    void save({ models: { [key]: v } }, msg).finally(() => setBusy(false));
  };
  const dirty = value.trim() !== current;
  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-center">
      <EngineBadge engine={engine.id} />
      <form
        className="flex min-w-0 flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && /^[\w.:@/-]*$/.test(value.trim())) run(value.trim(), fmt(W.modelSaved, { engine: engine.name }));
        }}
      >
        <Input
          label={fmt(W.model.label, { engine: engine.name })}
          hideLabel
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={fmt(W.model.placeholder, { model: current })}
          className="font-mono"
          wrapperClassName="min-w-48 flex-1"
          error={/^[\w.:@/-]*$/.test(value.trim()) ? undefined : copy.app.errors.validation}
          spellCheck={false}
          maxLength={120}
        />
        <Button type="submit" disabled={!dirty} loading={busy && dirty}>
          {W.modelSave}
        </Button>
        <Button variant="ghost" icon={RotateCcw} onClick={() => run('', fmt(W.modelResetDone, { engine: engine.name }))} disabled={busy}>
          {W.modelReset}
        </Button>
      </form>
    </li>
  );
}

function AnalysisCard({ engines, settings }: { engines: EngineInfo[]; settings: SettingsView }) {
  const save = useSave();
  // The select shows the stored preference ('' = automatic), not the engine that's effective right now:
  // otherwise "automatic" would read as a fixed choice as soon as one engine goes live.
  const preference = settings.analysisEnginePreference ?? '';
  const [chosen, setChosen] = useState<EngineId | ''>(preference);
  useEffect(() => setChosen(preference), [preference]);
  const live = engines.filter((e) => e.mode === 'live');
  const pickedInfo = engines.find((e) => e.id === chosen);
  const current = engines.find((e) => e.id === settings.analysisEngine);
  return (
    <Card>
      <CardHeader title={W.sections.analysis} subtitle={W.sections.analysisBody} />
      <div className="space-y-3 p-4">
        <Select<string>
          label={W.analysisLabel}
          value={chosen}
          onChange={(v) => {
            const next = (v || '') as EngineId | '';
            setChosen(next);
            void save({ analysisEngine: next || null }, W.saved);
          }}
          // Only live engines can write; a stored choice that isn't live yet stays visible so it isn't silently lost.
          options={[
            { value: '', label: live.length ? W.analysisAuto : W.analysis.none },
            ...live.map((e) => ({ value: e.id, label: e.name })),
            ...(pickedInfo && pickedInfo.mode !== 'live' ? [{ value: pickedInfo.id, label: fmt(W.analysisNotLiveOption, { engine: pickedInfo.name }) }] : []),
          ]}
          disabled={live.length === 0 && !pickedInfo}
          wrapperClassName="max-w-sm"
        />
        {(pickedInfo || current) && (
          <p className="text-[13px] text-text-muted">
            {pickedInfo && pickedInfo.mode !== 'live' ? fmt(W.analysisNotLive, { engine: pickedInfo.name }) : current ? fmt(W.analysis.current, { engine: current.name }) : null}
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- usage & budget

const PERIODS = ['7', '30', '90'] as const;
type Period = (typeof PERIODS)[number];

/** `2026-10` → `October 2026`; anything else (already a label) passes through. */
function monthName(label: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return label;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1]!, +m[2]! - 1, 1)));
}

const NOTE_TONES = {
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-2 text-text-muted',
} as const;

/** Status line with its icon (status color never alone, BRAND §6.2). */
function Note({ tone, icon: Icon, children, className }: { tone: keyof typeof NOTE_TONES; icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <p role={tone === 'danger' || tone === 'warning' ? 'status' : undefined} className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-[13px]', NOTE_TONES[tone], className)}>
      <Icon size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Month-to-date spend vs the monthly budget: brand blue below 80%, warning from 80%, danger (live checks paused) at 100%. */
function BudgetMeter({ month, liveCount }: { month: UsageView['month']; liveCount: number }) {
  const { spendUsd: spend, budgetUsd: budget } = month;
  const ratio = budget > 0 ? spend / budget : spend > 0 ? 1 : 0;
  const reached = budget > 0 && spend >= budget;
  const tone = reached ? 'danger' : ratio >= 0.8 ? 'warning' : 'primary';
  return (
    <div className="min-w-0">
      <div className="eyebrow">{fmt(U.monthSpend, { month: monthName(month.label) })}</div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display font-heading text-2xl tracking-[-0.012em] text-text-strong tnum">{usd(spend)}</span>
        <span className="text-sm text-text-muted">{fmt(U.ofBudget, { budget: usd(budget) })}</span>
      </p>
      <ProgressBar value={ratio} tone={tone} size="md" label={U.meterLabel} className="mt-3" />
      <p className="mt-1.5 flex justify-between gap-3 font-mono text-xs text-text-subtle tnum">
        <span>{budget > 0 ? pct(Math.min(ratio, 9.99)) : '—'}</span>
        <span>{fmt(U.remaining, { remaining: usd(Math.max(0, month.remainingUsd)) })}</span>
      </p>
      {reached ? (
        <Note tone="danger" icon={PauseCircle} className="mt-3">
          {U.reached}
        </Note>
      ) : budget === 0 && liveCount > 0 ? (
        <Note tone="warning" icon={AlertTriangle} className="mt-3">
          {U.zeroBudget}
        </Note>
      ) : ratio >= 0.8 ? (
        <Note tone="warning" icon={AlertTriangle} className="mt-3">
          {fmt(U.warning, { pct: pct(ratio), budget: usd(budget) })}
        </Note>
      ) : null}
    </div>
  );
}

const BUDGET_RE = /^\d{1,6}(\.\d{1,2})?$/;

/** Budget input, scheduled-check mode and same-day reuse. Mode and reuse save as soon as they change. */
function CostControls({ cost }: { cost: CostSettings }) {
  const save = useSave();
  const toast = useToast();
  /** Put a switch/segment back when the server refuses the change, and say why. */
  const revert = (undo: () => void) => (message: string) => {
    undo();
    toast.error(copy.app.errors.saveFailed, message);
  };
  const current = String(cost.monthlyBudgetUsd);
  const [budget, setBudget] = useState(current);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<RunMode>(cost.scheduledMode);
  const [reuse, setReuse] = useState(cost.reuseSameDay);
  useEffect(() => setBudget(current), [current]);
  useEffect(() => setMode(cost.scheduledMode), [cost.scheduledMode]);
  useEffect(() => setReuse(cost.reuseSameDay), [cost.reuseSameDay]);
  const value = budget.trim().replace(/^\$/, '');
  const valid = BUDGET_RE.test(value);
  const dirty = valid && Number(value) !== cost.monthlyBudgetUsd;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    const n = Number(value);
    setBusy(true);
    void save({ cost: { monthlyBudgetUsd: n } }, fmt(U.budget.saved, { budget: usd(n) })).finally(() => setBusy(false));
  };
  return (
    <div className="min-w-0 space-y-5">
      <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
        <Input
          label={U.budget.label}
          hint={U.budget.hint}
          error={value && !valid ? U.budget.invalid : undefined}
          icon={DollarSign}
          inputMode="decimal"
          autoComplete="off"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="font-mono tnum"
          wrapperClassName="min-w-40 flex-1"
          maxLength={10}
        />
        <Button type="submit" disabled={!dirty} loading={busy} className="mt-[22px]">
          {U.budget.save}
        </Button>
      </form>
      <div className="space-y-1.5">
        <div aria-hidden className="text-xs font-medium text-text-muted">
          {U.mode.label}
        </div>
        <SegmentedControl<RunMode>
          label={U.mode.label}
          size="md"
          value={mode}
          onChange={(v) => {
            if (v === mode) return;
            setMode(v);
            void save({ cost: { scheduledMode: v } }, v === 'batch' ? U.mode.savedBatch : U.mode.savedRealtime, undefined, revert(() => setMode(cost.scheduledMode)));
          }}
          options={[
            { value: 'batch', label: U.mode.batch },
            { value: 'realtime', label: U.mode.realtime },
          ]}
        />
        <p className="text-xs text-text-subtle">{mode === 'batch' ? U.mode.batchHint : U.mode.realtimeHint}</p>
      </div>
      <Switch
        label={U.reuse.label}
        description={U.reuse.description}
        checked={reuse}
        onCheckedChange={(v) => {
          setReuse(v);
          void save({ cost: { reuseSameDay: v } }, v ? U.reuse.on : U.reuse.off, undefined, revert(() => setReuse(cost.reuseSameDay)));
        }}
      />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-lg font-medium text-text tnum">{children}</dd>
    </div>
  );
}

function SavingsLine({ savings }: { savings: UsageView['savings'] }) {
  const parts = [
    savings.batchUsd > 0 ? fmt(U.savings.batch, { amount: usd(savings.batchUsd) }) : null,
    savings.cacheUsd > 0 ? fmt(U.savings.cache, { amount: usd(savings.cacheUsd) }) : null,
    savings.reuseUsd > 0 || savings.reusedAnswers > 0
      ? plural(savings.reusedAnswers, U.savings.reuse, { amount: usd(savings.reuseUsd), count: num(savings.reusedAnswers) })
      : null,
  ].filter((p): p is string => !!p);
  const total = savings.batchUsd + savings.cacheUsd + savings.reuseUsd;
  return (
    <Note tone="neutral" icon={PiggyBank}>
      {parts.length ? fmt(U.savings.line, { total: usd(total), parts: parts.join(', ') }) : U.savings.none}
    </Note>
  );
}

function DailySpend({ usage }: { usage: UsageView }) {
  // A day without answers is a gap, not a $0 bar (BRAND §7.1 "gaps are honest").
  const data = usage.byDay.map((d) => ({ day: d.day, spend: d.answers > 0 ? d.costUsd : null }));
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-[13px] font-semibold text-text">{U.daily.title}</h4>
      <StackedAreaChart
        data={data}
        series={[{ key: 'spend', name: U.daily.series, color: BRAND_COLOR }]}
        variant="bar"
        height={200}
        legend={false}
        format={(v) => usd(v, { precise: true })}
        ariaLabel={U.daily.aria}
      />
    </div>
  );
}

function EngineTable({ rows: data }: { rows: UsageView['byEngine'] }) {
  const C = U.byEngine.columns;
  const tokens = (r: UsageView['byEngine'][number]) => r.inputTokens + r.outputTokens;
  const { rows, sortProps } = useSort(
    data,
    { engine: (r) => r.name, answers: (r) => r.answers, cost: (r) => r.costUsd, avg: (r) => r.avgCostUsd, tokens, cached: (r) => r.cachedTokens, searches: (r) => r.searchCalls, batch: (r) => r.batchShare },
    { key: 'cost', dir: 'desc' },
  );
  return (
    <div className="min-w-0">
      <h4 className="mb-2 px-4 text-[13px] font-semibold text-text">{U.byEngine.title}</h4>
      <Table className="min-w-[44rem]">
        <THead>
          <tr>
            <Th {...sortProps('engine', 'asc')}>{C.engine}</Th>
            <Th num {...sortProps('answers')}>{C.answers}</Th>
            <Th num {...sortProps('cost')}>{C.cost}</Th>
            <Th num {...sortProps('avg')}>{C.avg}</Th>
            <Th num {...sortProps('tokens')}>{C.tokens}</Th>
            <Th num {...sortProps('cached')}>{C.cached}</Th>
            <Th num {...sortProps('searches')}>{C.searches}</Th>
            <Th num {...sortProps('batch')}>{C.batch}</Th>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={8}>{U.noLive}</TableEmpty>
          ) : (
            rows.map((r) => (
              <Tr key={r.engine}>
                <Td>
                  <EngineBadge engine={r.engine} />
                  {r.model && <span className="mt-0.5 block truncate font-mono text-2xs text-text-subtle">{r.model}</span>}
                </Td>
                <Td num>{num(r.answers)}</Td>
                <Td num>{usd(r.costUsd)}</Td>
                <Td num>{r.answers ? usd(r.avgCostUsd, { precise: true }) : '—'}</Td>
                <Td num>
                  <Tooltip content={fmt(U.byEngine.tokensTooltip, { input: num(r.inputTokens), output: num(r.outputTokens) })}>
                    <span tabIndex={0}>{num(tokens(r), { compact: true })}</span>
                  </Tooltip>
                </Td>
                <Td num muted>
                  {num(r.cachedTokens, { compact: true })}
                </Td>
                <Td num muted>
                  {num(r.searchCalls)}
                </Td>
                <Td num muted>
                  {r.answers ? pct(r.batchShare) : '—'}
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}

/** Period totals, savings, daily spend and the per-engine table. */
function UsageDetail({ usage, liveCount }: { usage: UsageView; liveCount: number }) {
  const t = usage.totals;
  if (t.liveAnswers === 0)
    return liveCount === 0 ? (
      <Note tone="neutral" icon={FlaskConical}>
        {U.simulatedOnly}
      </Note>
    ) : (
      <p className="text-[13px] text-text-subtle">{U.noLive}</p>
    );
  const saved = usage.savings.batchUsd + usage.savings.cacheUsd + usage.savings.reuseUsd;
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Stat label={U.stats.spend}>{usd(t.costUsd)}</Stat>
        <Stat label={U.stats.answers}>{num(t.liveAnswers)}</Stat>
        <Stat label={U.stats.avg}>{usd(t.costUsd / t.liveAnswers, { precise: true })}</Stat>
        <Stat label={U.stats.saved}>{usd(saved)}</Stat>
      </dl>
      <SavingsLine savings={usage.savings} />
      <DailySpend usage={usage} />
    </div>
  );
}

function UsageCard({ settings, liveCount }: { settings: SettingsView; liveCount: number }) {
  const [period, setPeriod] = useState<Period>('30');
  const usage = useUsage(Number(period));
  const cost = settings.cost;
  const unavailable = usage.isError && isNotFound(usage.error);
  const u = usage.data;
  const periodSelect = u && (
    <Select<Period>
      label={U.period}
      hideLabel
      size="sm"
      value={period}
      onChange={setPeriod}
      options={PERIODS.map((d) => ({ value: d, label: copy.filters.range.options[d] }))}
    />
  );

  // A server without cost tracking: say so once, briefly.
  if (!cost && (unavailable || (!usage.isLoading && !u)))
    return (
      <Card>
        <CardHeader title={U.title} />
        <div className="p-4">
          <Note tone="info" icon={Info}>
            {U.unavailable}
          </Note>
        </div>
      </Card>
    );

  return (
    <Card>
      <CardHeader title={U.title} subtitle={U.subtitle} actions={periodSelect} />
      <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
        {usage.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : u ? (
          <BudgetMeter month={u.month} liveCount={liveCount} />
        ) : unavailable ? (
          <Note tone="info" icon={Info}>
            {U.unavailable}
          </Note>
        ) : (
          <ErrorState size="sm" error={usage.error} onRetry={() => void usage.refetch()} />
        )}
        {cost && <CostControls cost={cost} />}
      </div>
      {u && (
        <>
          <div className="border-t border-border p-4">
            <UsageDetail usage={u} liveCount={liveCount} />
          </div>
          {u.totals.liveAnswers > 0 && (
            <div className={cn('border-t border-border pb-2 pt-4', usage.isPlaceholderData && 'opacity-60')}>
              <EngineTable rows={u.byEngine} />
            </div>
          )}
          <CardFooter>{fmt(U.pricing, { date: dayLabel(u.pricingAsOf, { year: true }) })}</CardFooter>
        </>
      )}
    </Card>
  );
}

export default function WorkspaceSettingsPage() {
  const settings = useSettings();
  const engines = useEngines();
  const list = engines.data ?? [];
  const s = settings.data;
  const liveCount = list.filter((e) => e.mode === 'live').length;

  let body;
  if (settings.isLoading || engines.isLoading)
    body = (
      <div className="space-y-4" aria-busy="true">
        <SkeletonCard height={360} />
        <SkeletonCard height={200} />
      </div>
    );
  else if (settings.isError || engines.isError || !s)
    body = (
      <ErrorState
        bordered
        title={copy.app.errors.generic.title}
        error={settings.error ?? engines.error}
        onRetry={() => {
          void settings.refetch();
          void engines.refetch();
        }}
      />
    );
  else
    body = (
      <div className="space-y-6">
        <Card>
          <CardHeader
            title={W.sections.keys}
            subtitle={W.sections.keysBody}
            actions={<span className="font-mono text-xs text-text-muted tnum">{fmt(W.liveSummary, { live: liveCount, total: list.length })}</span>}
          />
          <p className="mx-4 mt-3 flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
            <Lock size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            {W.storageNote}
          </p>
          <ul className="mt-2 divide-y divide-border">
            {list.map((e) => (
              <KeyRow key={e.id} engine={e} masked={s.keys[e.keySetting] ?? null} />
            ))}
          </ul>
        </Card>
        <UsageCard settings={s} liveCount={liveCount} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader title={W.sections.models} subtitle={W.sections.modelsBody} />
            <ul className="mt-2 divide-y divide-border">
              {list.map((e) => (
                <ModelRow key={e.id} engine={e} current={s.models[modelSetting(e)] ?? ''} />
              ))}
            </ul>
          </Card>
          <div>
            <AnalysisCard engines={list} settings={s} />
          </div>
        </div>
      </div>
    );

  return (
    <Page className="max-w-5xl">
      <PageHeader title={W.title} subtitle={W.subtitle} className="mb-0" />
      {body}
    </Page>
  );
}
