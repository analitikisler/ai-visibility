// Monitor dashboards: overview, per-prompt stats, cited sources, and the raw answers behind them.
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { ENGINE_IDS } from '../engines/catalog.ts';
import { getOverview, getPromptStats, getResponse, getSources, listResponses, type AggFilter } from '../services/monitor.ts';
import { getProject } from '../services/projects.ts';
import { notFound, validate } from './projects.ts';

const AggQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  engine: z.enum(ENGINE_IDS).optional(),
  tier: z.enum(['must_win', 'core', 'foundational']).optional(),
});

const ResponsesQuery = z.object({
  promptId: z.string().min(1).optional(),
  engine: z.enum(ENGINE_IDS).optional(),
  runId: z.string().min(1).optional(),
  mentioned: z.enum(['0', '1']).transform((v) => v === '1').optional(),
  failed: z.enum(['0', '1']).transform((v) => v === '1').optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  tier: z.enum(['must_win', 'core', 'foundational']).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  citedDomain: z.string().trim().toLowerCase().min(1).max(253).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Resolves :id to an existing project and parses the common aggregate query (?days&engine&tier). */
function aggregateArgs(c: Context): [string, AggFilter] {
  const project = getProject(c.req.param('id') ?? '');
  if (!project) throw notFound('Project');
  return [project.id, validate(AggQuery, c.req.query())];
}

const app = new Hono();

app.get('/projects/:id/overview', (c) => c.json(getOverview(...aggregateArgs(c))));
app.get('/projects/:id/prompt-stats', (c) => c.json(getPromptStats(...aggregateArgs(c))));
app.get('/projects/:id/sources', (c) => c.json(getSources(...aggregateArgs(c))));

app.get('/projects/:id/responses', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) throw notFound('Project');
  return c.json(listResponses(project.id, validate(ResponsesQuery, c.req.query())));
});

app.get('/responses/:rid', (c) => {
  const r = getResponse(c.req.param('rid'));
  if (!r) throw notFound('Response');
  return c.json(r);
});

export default app;
