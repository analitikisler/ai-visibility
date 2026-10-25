// In-process scheduler: every 5 minutes, start runs for projects whose daily/weekly schedule is due.
import { all } from '../db/index.ts';
import { getProject } from './projects.ts';
import { startBatchPoller } from './batches.ts';
import { recoverRuns, RunError, startRun } from './runs.ts';

const TICK_MS = 5 * 60_000;
const INTERVAL_MS = { daily: 24 * 3600_000, weekly: 7 * 24 * 3600_000 } as const;
/** Don't retry a project whose last attempt (e.g. a failed run) started within this window. */
const RETRY_BACKOFF_MS = 3600_000;

let timer: NodeJS.Timeout | null = null;

/** Project ids whose last completed run is older than their schedule interval. */
export function dueProjectIds(now = Date.now()): string[] {
  const rows = all<{ id: string; schedule: 'daily' | 'weekly'; last_ok: string | null; last_any: string | null }>(`
    SELECT p.id, p.schedule,
      (SELECT MAX(started_at) FROM runs r WHERE r.project_id = p.id AND r.status = 'completed') last_ok,
      (SELECT MAX(started_at) FROM runs r WHERE r.project_id = p.id) last_any
    FROM projects p WHERE p.schedule IN ('daily','weekly')`);
  return rows
    .filter((r) => !r.last_ok || now - Date.parse(r.last_ok) >= INTERVAL_MS[r.schedule])
    .filter((r) => !r.last_any || now - Date.parse(r.last_any) >= RETRY_BACKOFF_MS || r.last_any === r.last_ok)
    .map((r) => r.id);
}

function tick(): void {
  for (const pid of dueProjectIds()) {
    const project = getProject(pid);
    if (!project) continue;
    try {
      startRun(project, { trigger: 'scheduled' });
    } catch (err) {
      if (!(err instanceof RunError)) console.error('[scheduler] could not start run', pid, err);
    }
  }
}

/** Starts the in-process scheduler that triggers due project runs. Must be idempotent. */
export function startScheduler(): void {
  if (timer) return;
  try {
    recoverRuns();
  } catch (err) {
    console.error('[scheduler] run recovery failed', err);
  }
  const safeTick = () => {
    try {
      tick();
    } catch (err) {
      console.error('[scheduler] tick failed', err);
    }
  };
  startBatchPoller();
  // The hosted instance (NODE_ENV=production) runs the schedule. A local dev server sharing the same projects and live
  // keys would run — and pay for — every scheduled check a second time, so it only does so with SCHEDULER=on.
  if (process.env.NODE_ENV !== 'production' && process.env.SCHEDULER !== 'on') {
    console.log('[scheduler] scheduled checks off in development (set SCHEDULER=on to enable); manual checks still work');
    return;
  }
  setTimeout(safeTick, 15_000).unref();
  timer = setInterval(safeTick, TICK_MS);
  timer.unref();
}
