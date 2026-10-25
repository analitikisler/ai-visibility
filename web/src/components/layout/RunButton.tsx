import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock, Coins, Play, RefreshCw } from 'lucide-react';
import type { Run } from '@shared/types';
import { Button, IconButton, Menu, ProgressBar, Tooltip, useToast, type MenuItemDef } from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, isRunActive, isWaitingOnBatch, useActiveRun, useRun, useSettings, useStartRun, type StartRunBody } from '@/lib/api';
import { cn } from '@/lib/cn';
import { describeEngineError, engineName } from '@/lib/engines';
import { num, relativeTime, usd } from '@/lib/format';
import { useProject } from './ProjectContext';

const hasCost = (run: Pick<Run, 'costUsd'>) => typeof run.costUsd === 'number' && run.costUsd > 0;

/** Toast for a finished check (complete / with gaps / failed). */
function useRunToasts(run: Run | undefined) {
  const toast = useToast();
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!run || isRunActive(run) || announced.current === run.id) return;
    announced.current = run.id;
    const rc = copy.app.runCheck;
    // The run error is raw ("N of M jobs failed: chatgpt: HTTP 401: {…}"): say why in plain words instead.
    const reason = run.error ? describeEngineError(run.error).message : '';
    if (run.status === 'failed' || (run.doneJobs === 0 && run.failedJobs > 0)) {
      toast.toast({ tone: 'error', title: rc.failed, description: fmt(rc.failedDetail, { error: reason }).trim() });
    } else if (run.failedJobs > 0) {
      toast.toast({ tone: 'warning', title: rc.partial, description: `${fmt(rc.partialDetail, { failed: run.failedJobs, total: run.totalJobs })} ${reason}`.trim() });
    } else if (run.doneJobs === 0 && run.reusedJobs) {
      toast.toast({ tone: 'info', title: rc.allReused, description: plural(run.reusedJobs, rc.allReusedDetail, { count: num(run.reusedJobs) }) });
    } else {
      const count = num(run.doneJobs);
      const detail = hasCost(run) ? fmt(rc.completedDetailCost, { count, cost: usd(run.costUsd) }) : fmt(rc.completedDetail, { count });
      const reused = run.reusedJobs ? plural(run.reusedJobs, rc.reused, { count: num(run.reusedJobs) }) : '';
      toast.success(rc.completed, `${detail} ${reused}`.trim());
    }
  }, [run, toast]);
}

/** Engines still in a provider batch ("ChatGPT, Claude") and when the earliest was submitted. */
function batchInfo(run: Run) {
  const pending = run.pendingBatches ?? [];
  const submitted = pending.reduce<string | null>((min, b) => (!min || b.submittedAt < min ? b.submittedAt : min), null);
  return { engines: pending.map((b) => engineName(b.engine)).join(', '), since: relativeTime(submitted ?? run.startedAt) };
}

/**
 * In-place progress for empty states: `Checking x/y` with a bar while answers stream in, or a calm
 * "Waiting on batch" line (no bar, nothing that implies seconds) while provider batches process.
 */
export function RunProgress({ run, className }: { run: Run | null; className?: string }) {
  const rc = copy.app.runCheck;
  if (run && isWaitingOnBatch(run)) {
    const { engines, since } = batchInfo(run);
    return (
      <div className={cn('max-w-sm', className)} role="status">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-text">
          <Clock size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
          {fmt(rc.waiting, { engines })}
        </p>
        <p className="mt-1 text-xs text-text-muted">{fmt(rc.waitingDetail, { time: since })}</p>
      </div>
    );
  }
  return (
    <div className={cn('w-64', className)} role="status">
      <ProgressBar
        value={run && run.totalJobs ? (run.doneJobs + run.failedJobs) / run.totalJobs : 0}
        indeterminate={!run || run.status === 'queued'}
        label="Check progress"
      />
      <p className="mt-2 font-mono text-xs text-text-muted tnum">
        {run && run.totalJobs ? fmt(rc.running, { done: run.doneJobs + run.failedJobs, total: run.totalJobs }) : rc.queued}
      </p>
    </div>
  );
}

/** Calm "Waiting on batch · ChatGPT, Claude" pill: provider batches take minutes to hours, so no spinner. */
function BatchWaiting({ run, className }: { run: Run; className?: string }) {
  const rc = copy.app.runCheck;
  const { engines, since } = batchInfo(run);
  return (
    <Tooltip content={fmt(rc.waitingTooltip, { time: since })} triggerClassName={className}>
      <div
        role="status"
        tabIndex={0}
        className="flex h-8 max-w-[13rem] items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-[13px] font-medium text-text-muted sm:max-w-[24rem]"
      >
        <Clock size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className="truncate">{fmt(rc.waiting, { engines })}</span>
      </div>
    </Tooltip>
  );
}

/**
 * "Run check" (real-time) with a menu for the cheaper batch path and a forced re-check, live `Checking x/y`
 * progress while a run streams in, and a calm waiting state while provider batches process.
 */
export function RunButton({ className }: { className?: string }) {
  const { project, projectId, engines } = useProject();
  const toast = useToast();
  const start = useStartRun(projectId);
  const settings = useSettings();
  const { run: active, lastRun } = useActiveRun(projectId);
  // Keep watching a run we saw in flight so we can announce how it ended.
  const [watchId, setWatchId] = useState<string | null>(null);
  useEffect(() => {
    if (active && active.id !== watchId) setWatchId(active.id);
  }, [active, watchId]);
  const watched = useRun(watchId);
  useRunToasts(watchId && watched.data && !isRunActive(watched.data) ? watched.data : undefined);

  const rc = copy.app.runCheck;
  const onRun = (body: StartRunBody = {}) => {
    if (project.promptCount === 0) return void toast.toast({ tone: 'info', title: rc.noPrompts });
    if (project.engines.length === 0) return void toast.toast({ tone: 'info', title: rc.noEngines });
    start.mutate(body, {
      onSuccess: (r) => {
        setWatchId(r.id);
        // A batch run that reused every answer finishes at once; its completion toast says so instead.
        if (r.mode === 'batch' && isRunActive(r)) toast.toast({ tone: 'info', title: rc.batchStarted, description: rc.batchStartedDetail });
      },
      onError: (e) => toast.error(rc.failed, errorMessage(e)),
    });
  };

  if (active && isWaitingOnBatch(active)) return <BatchWaiting run={active} className={className} />;

  if (active || start.isPending) {
    const done = active ? active.doneJobs + active.failedJobs : 0;
    const total = active?.totalJobs ?? 0;
    const queued = !active || active.status === 'queued' || total === 0;
    const label = queued ? rc.queued : fmt(rc.running, { done, total });
    return (
      <Tooltip
        content={fmt(rc.runningTooltip, { engines: project.engines.length, prompts: project.promptCount })}
        triggerClassName={className}
      >
        <div
          role="status"
          aria-live="polite"
          className="relative flex h-8 items-center gap-2 overflow-hidden rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-text"
        >
          {/* Running: a status dot that breathes (opacity only; nothing scales, Tally motion). */}
          <span aria-hidden className="inline-flex size-2 shrink-0 rounded-full bg-accent animate-[shimmer_1.6s_ease-in-out_infinite] motion-reduce:animate-none" />
          <span className="font-mono text-[13px] tnum">{label}</span>
          <ProgressBar
            value={total ? done / total : 0}
            indeterminate={queued}
            size="xs"
            label="Check progress"
            className="absolute inset-x-0 bottom-0 rounded-none bg-transparent"
          />
        </div>
      </Tooltip>
    );
  }

  // The menu needs a server with cost controls (`settings.cost`); re-checking only differs from a normal check when reuse is on.
  const cost = settings.data?.cost;
  const anyLive = engines.some((e) => e.mode === 'live');
  const items: MenuItemDef[] = cost
    ? [
        {
          key: 'batch',
          icon: Coins,
          label: rc.batch,
          description: anyLive ? rc.batchHint : rc.batchSimulated,
          disabled: !anyLive,
          onSelect: () => onRun({ mode: 'batch' }),
        },
        ...(cost.reuseSameDay
          ? [{ key: 'force', icon: RefreshCw, label: rc.force, description: anyLive ? rc.forceHint : rc.forceHintSimulated, onSelect: () => onRun({ force: true }) }]
          : []),
      ]
    : [];
  const tip = lastRun
    ? hasCost(lastRun)
      ? fmt(rc.lastRunCost, { time: relativeTime(lastRun.finishedAt ?? lastRun.startedAt), cost: usd(lastRun.costUsd) })
      : fmt(rc.lastRun, { time: relativeTime(lastRun.finishedAt ?? lastRun.startedAt) })
    : rc.neverRun;

  const main = (
    <Tooltip content={tip} triggerClassName={items.length ? undefined : className}>
      <Button variant="secondary" icon={Play} onClick={() => onRun()} className={items.length ? 'rounded-r-none' : undefined}>
        {rc.idle}
      </Button>
    </Tooltip>
  );
  if (!items.length) return main;
  return (
    <div className={cn('flex items-center', className)}>
      {main}
      <Menu
        align="end"
        label={rc.menu}
        items={items}
        trigger={(p) => <IconButton {...p} icon={ChevronDown} label={rc.menu} variant="secondary" className="-ml-px rounded-l-none" />}
      />
    </div>
  );
}
