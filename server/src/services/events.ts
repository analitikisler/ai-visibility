// Project events: things that changed in a project (a draft published, a competitor added, an audit score change…).
// They are shown as markers on trend charts, so a move in the numbers can be read against what was done.
import { all, daysAgo, id, insert, nowIso } from '../db/index.ts';
import type { ProjectEvent, ProjectEventKind } from '../../../shared/types.ts';

const TITLE_MAX = 160;

/** Records one event. `ts` defaults to now (the demo seed back-dates its sample events). */
export function recordEvent(projectId: string, kind: ProjectEventKind, title: string, ts: string = nowIso()): void {
  const clean = title.replace(/\s+/g, ' ').trim();
  insert('project_events', {
    id: id('evt'), project_id: projectId, ts, day: ts.slice(0, 10), kind,
    title: clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean,
  });
}

/** Events in the last `days` days, oldest first. */
export function listEvents(projectId: string, days: number): ProjectEvent[] {
  return all<ProjectEvent>(
    'SELECT id, ts, day, kind, title FROM project_events WHERE project_id = ? AND day >= ? ORDER BY ts, rowid',
    [projectId, daysAgo(days - 1)],
  );
}
