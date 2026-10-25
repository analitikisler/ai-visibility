// Run bookkeeping shared by realtime processing (runs.ts) and provider batches (batches.ts).
import { all, get, nowIso, parseJson, run } from '../db/index.ts';
import type { EngineId, Run, RunMode, RunStatus } from '../../../shared/types.ts';

export interface RunRow {
  id: string; project_id: string; trigger: string; status: string; engines_json: string; total_jobs: number;
  done_jobs: number; failed_jobs: number; error: string | null; day: string; started_at: string; finished_at: string | null;
  mode: string; reused_jobs: number;
}

export function toRun(r: RunRow): Run {
  const pending = all<{ engine: EngineId; items_json: string; submitted_at: string }>(
    "SELECT engine, items_json, submitted_at FROM batch_jobs WHERE run_id = ? AND status = 'submitted'", [r.id]);
  const cost = get<{ c: number | null }>('SELECT SUM(cost_usd) c FROM responses WHERE run_id = ?', [r.id])?.c ?? null;
  return {
    id: r.id, projectId: r.project_id, trigger: r.trigger as Run['trigger'], status: r.status as RunStatus,
    engines: parseJson<EngineId[]>(r.engines_json, []), totalJobs: r.total_jobs, doneJobs: r.done_jobs, failedJobs: r.failed_jobs,
    error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
    mode: (r.mode === 'batch' ? 'batch' : 'realtime') satisfies RunMode,
    pendingBatches: pending.map((b) => ({ engine: b.engine, jobs: Object.keys(parseJson<Record<string, string>>(b.items_json, {})).length, submittedAt: b.submitted_at })),
    reusedJobs: r.reused_jobs,
    costUsd: cost === null ? undefined : Math.round(cost * 10_000) / 10_000,
  };
}

export function getRunRow(runId: string): RunRow | undefined {
  return get<RunRow>('SELECT * FROM runs WHERE id = ?', [runId]);
}

/** Counts one finished job (answered or failed). */
export function bumpRun(runId: string, ok: boolean): void {
  run(`UPDATE runs SET ${ok ? 'done_jobs = done_jobs' : 'failed_jobs = failed_jobs'} + 1 WHERE id = ?`, [runId]);
}

const firstErrors = new Map<string, string>();
/** Remembers the first job error of a run for its summary line. */
export function noteRunError(runId: string, message: string): void {
  if (!firstErrors.has(runId)) firstErrors.set(runId, message);
}

/** Completes the run once every job is counted and no provider batch is still pending. */
export function maybeFinishRun(runId: string): void {
  const r = getRunRow(runId);
  if (!r || (r.status !== 'running' && r.status !== 'queued')) return;
  const pending = get<{ n: number }>("SELECT COUNT(*) n FROM batch_jobs WHERE run_id = ? AND status = 'submitted'", [runId])?.n ?? 0;
  if (pending || r.done_jobs + r.failed_jobs < r.total_jobs) return;
  const firstError = firstErrors.get(runId) ?? null;
  firstErrors.delete(runId);
  const failed = r.total_jobs > 0 && r.failed_jobs >= r.total_jobs;
  const error = r.failed_jobs ? `${r.failed_jobs} of ${r.total_jobs} jobs failed${firstError ? `: ${firstError}` : ''}`.slice(0, 300) : null;
  run('UPDATE runs SET status = ?, error = ?, finished_at = ? WHERE id = ?', [failed ? 'failed' : 'completed', error, nowIso(), runId]);
}

export function failRun(runId: string, message: string): void {
  run("UPDATE runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", [message.slice(0, 300), nowIso(), runId]);
}
