// Runs: a run = (prompt × engine) jobs answered by the engines, analyzed and stored. Realtime jobs go through a small
// worker pool; in 'batch' runs, engines with a provider batch API get one batch each (~50% cheaper, results within
// hours) and the run completes when the poller collects them. Answers already collected today are reused unless forced.
// Job failures are recorded on the response row and counted, never thrown.
import { all, dayOf, get, id, insert, nowIso, parseJson, run } from '../db/index.ts';
import type { EngineId, Project, Prompt, Run, RunMode } from '../../../shared/types.ts';
import { saveResponse } from '../analysis/persist.ts';
import { ask } from '../engines/index.ts';
import { batchedPromptKeys, canBatch, submitBatch } from './batches.ts';
import { costSettings } from './cost.ts';
import { getProject, listPrompts } from './projects.ts';
import { bumpRun, failRun, getRunRow, maybeFinishRun, noteRunError, toRun, type RunRow } from './run-state.ts';

export { toRun } from './run-state.ts';

interface Job { prompt: Prompt; engine: EngineId }

const CONCURRENCY = 4;
/** Interrupted runs older than this are marked failed at boot instead of resumed. */
const RESUME_WINDOW_MS = 6 * 3600_000;

export function getRun(runId: string): Run | null {
  const row = getRunRow(runId);
  return row ? toRun(row) : null;
}

export function listRuns(projectId: string, limit = 60): Run[] {
  return all<RunRow>('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?', [projectId, limit]).map(toRun);
}

export function latestRun(projectId: string): Run | null {
  return listRuns(projectId, 1)[0] ?? null;
}

export function activeRun(projectId: string): Run | null {
  const row = get<RunRow>("SELECT * FROM runs WHERE project_id = ? AND status IN ('queued','running') ORDER BY started_at DESC LIMIT 1", [projectId]);
  return row ? toRun(row) : null;
}

export class RunError extends Error {
  readonly status = 400;
}

/** prompt|engine pairs that already have a successful answer today (reused instead of paying again). */
function answeredToday(projectId: string, day: string): Set<string> {
  return new Set(all<{ k: string }>(
    "SELECT DISTINCT prompt_id || '|' || engine k FROM responses WHERE project_id = ? AND day = ? AND error IS NULL", [projectId, day],
  ).map((x) => x.k));
}

export interface StartRunOptions {
  engines?: EngineId[];
  promptIds?: string[];
  trigger?: Run['trigger'];
  /** Defaults to the workspace's scheduled mode for scheduled runs, realtime otherwise. */
  mode?: RunMode;
  /** Re-ask prompts already answered today. */
  force?: boolean;
}

/**
 * Creates a run and processes it in the background. Returns the already-active run if one is queued/running.
 * Throws RunError when there is nothing to run. When every job was already answered today, the run is recorded
 * as completed straight away with `reusedJobs` set.
 */
export function startRun(project: Project, opts: StartRunOptions = {}): Run {
  const existing = activeRun(project.id);
  if (existing) return existing;
  const settings = costSettings();
  const mode: RunMode = opts.mode ?? (opts.trigger === 'scheduled' ? settings.scheduledMode : 'realtime');
  const engines = [...new Set(opts.engines?.length ? opts.engines : project.engines)];
  const prompts = listPrompts(project.id).filter((p) => (opts.promptIds?.length ? opts.promptIds.includes(p.id) : p.active));
  const candidates = prompts.flatMap((prompt) => engines.map((engine) => ({ prompt, engine })));
  if (!candidates.length) throw new RunError(prompts.length ? 'No engines selected' : 'Project has no active prompts');
  const day = dayOf();
  const done = settings.reuseSameDay && !opts.force ? answeredToday(project.id, day) : new Set<string>();
  const jobs = candidates.filter((j) => !done.has(`${j.prompt.id}|${j.engine}`));
  const runId = id('run');
  insert('runs', {
    id: runId, project_id: project.id, trigger: opts.trigger ?? 'manual', status: jobs.length ? 'queued' : 'completed',
    engines_json: JSON.stringify(engines), total_jobs: jobs.length, done_jobs: 0, failed_jobs: 0, error: null, day,
    started_at: nowIso(), finished_at: jobs.length ? null : nowIso(), mode, reused_jobs: candidates.length - jobs.length,
  });
  if (jobs.length) void processRun(runId, project, jobs, mode);
  return getRun(runId)!;
}

/** Answers jobs in real time with a small worker pool. */
async function answerRealtime(runId: string, project: Project, jobs: Job[], day: string, economy = false): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      let ok = false;
      try {
        const answer = await ask(job.engine, job.prompt.text, { project, prompt: job.prompt, day, economy });
        saveResponse({ runId, project, promptId: job.prompt.id, engine: job.engine, answer, day, createdAt: nowIso() });
        ok = !answer.error;
        if (answer.error) noteRunError(runId, `${job.engine}: ${answer.error}`);
      } catch (err) {
        noteRunError(runId, `${job.engine}: ${err instanceof Error ? err.message : String(err)}`);
      }
      bumpRun(runId, ok);
      // Simulated answers resolve synchronously; yield so big runs don't block the event loop.
      await new Promise((r) => setImmediate(r));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
}

async function processRun(runId: string, project: Project, jobs: Job[], mode: RunMode): Promise<void> {
  try {
    const day = get<{ day: string }>('SELECT day FROM runs WHERE id = ?', [runId])?.day ?? dayOf();
    run("UPDATE runs SET status = 'running' WHERE id = ?", [runId]);
    const realtime: Job[] = [];
    if (mode === 'batch') {
      const byEngine = new Map<EngineId, Prompt[]>();
      for (const j of jobs) {
        if (canBatch(j.engine, project)) byEngine.set(j.engine, [...(byEngine.get(j.engine) ?? []), j.prompt]);
        else realtime.push(j);
      }
      // Submit batches first (persisted before answering anything else), then answer the rest in real time.
      for (const [engine, prompts] of byEngine) {
        await submitBatch(runId, project, engine, prompts, day, (fallback) => realtime.push(...fallback.map((prompt) => ({ prompt, engine }))));
      }
    } else {
      realtime.push(...jobs);
    }
    // In batch runs, engines without a batch API still use their cheaper tier where one exists (OpenAI flex).
    await answerRealtime(runId, project, realtime, day, mode === 'batch');
    maybeFinishRun(runId);
  } catch (err) {
    console.error('[runs] run failed', runId, err);
    try {
      failRun(runId, String((err as Error)?.message ?? err));
    } catch (e) {
      console.error('[runs] could not mark run failed', runId, e);
    }
  }
}

/**
 * Boot recovery for runs left queued/running by a restart. Jobs inside a submitted provider batch are left to the
 * batch poller; recent runs answer their remaining jobs in real time (prompts answered today are not re-asked);
 * old runs without pending batches are marked failed. total_jobs is re-based so the run always completes.
 */
export function recoverRuns(): void {
  const stale = all<RunRow>("SELECT * FROM runs WHERE status IN ('queued','running')");
  for (const r of stale) {
    const project = getProject(r.project_id);
    const pendingItems = all<{ items_json: string }>("SELECT items_json FROM batch_jobs WHERE run_id = ? AND status = 'submitted'", [r.id])
      .reduce((sum, b) => sum + Object.keys(parseJson<Record<string, string>>(b.items_json, {})).length, 0);
    const recent = Date.now() - Date.parse(r.started_at) < RESUME_WINDOW_MS;
    if (!project || (!recent && !pendingItems)) {
      failRun(r.id, 'Interrupted by a server restart');
      continue;
    }
    const counts = get<{ done: number; failed: number }>(
      'SELECT COALESCE(SUM(error IS NULL), 0) done, COALESCE(SUM(error IS NOT NULL), 0) failed FROM responses WHERE run_id = ?', [r.id]);
    const skip = new Set([...answeredToday(project.id, r.day), ...batchedPromptKeys(r.id)]);
    const engines = parseJson<EngineId[]>(r.engines_json, []);
    const remaining = recent
      ? listPrompts(project.id).filter((p) => p.active).flatMap((prompt) => engines.map((engine) => ({ prompt, engine })))
        .filter((j) => !skip.has(`${j.prompt.id}|${j.engine}`))
      : [];
    const done = counts?.done ?? 0;
    const failed = counts?.failed ?? 0;
    run('UPDATE runs SET done_jobs = ?, failed_jobs = ?, total_jobs = ? WHERE id = ?', [done, failed, done + failed + pendingItems + remaining.length, r.id]);
    if (remaining.length) void answerRealtime(r.id, project, remaining, r.day).then(() => maybeFinishRun(r.id));
    else maybeFinishRun(r.id);
  }
}
