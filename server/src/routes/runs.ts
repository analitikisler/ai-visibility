// Runs: trigger (async, poll for progress), list, detail.
import { Hono } from 'hono';
import { z } from 'zod';
import { ENGINE_IDS } from '../engines/catalog.ts';
import { getProject } from '../services/projects.ts';
import { getRun, listRuns, startRun } from '../services/runs.ts';
import { notFound, readJson, validate } from './projects.ts';

const RunSchema = z.object({
  engines: z.array(z.enum(ENGINE_IDS)).max(ENGINE_IDS.length).optional(),
  promptIds: z.array(z.string().min(1)).max(500).optional(),
  /** 'batch' = provider batch APIs where available (~50% cheaper, results within hours). */
  mode: z.enum(['realtime', 'batch']).optional(),
  /** Re-ask prompts already answered today. */
  force: z.boolean().optional(),
});

const app = new Hono();

/** Starts a run (or returns the one already queued/running) and processes it in the background. */
app.post('/projects/:id/runs', async (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) throw notFound('Project');
  const body = validate(RunSchema, await readJson(c));
  return c.json(startRun(project, { ...body, trigger: 'manual' }), 202);
});

app.get('/projects/:id/runs', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) throw notFound('Project');
  return c.json(listRuns(project.id));
});

app.get('/runs/:rid', (c) => {
  const r = getRun(c.req.param('rid'));
  if (!r) throw notFound('Run');
  return c.json(r);
});

export default app;
