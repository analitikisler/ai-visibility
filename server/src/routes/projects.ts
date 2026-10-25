// Projects, competitors, prompts, setup suggestions and demo seeding.
import type { Context } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { normalizeDomain } from '../analysis/citations.ts';
import { ENGINE_IDS } from '../engines/catalog.ts';
import {
  addCompetitors, createProject, createPrompts, deleteCompetitor, deleteProject, deletePrompt, getProject, listCompetitors,
  listProjects, listPrompts, suggestProject, updateCompetitor, updateProject, updatePrompt,
} from '../services/projects.ts';
import { seedDemo } from '../services/seed.ts';

// ---------------------------------------------------------------- shared request helpers (used by Core's route modules)

/**
 * Parses with a zod schema or throws a 400 `{ error, field, issues }`: `error` is the plain reason(s) a person can read
 * ("API keys can only contain…"), `field` the first failing path ("keys.ANTHROPIC_API_KEY"), `issues` all of them.
 */
export function validate<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issues = r.error.issues.map((i) => ({ field: i.path.map(String).join('.') || null, message: i.message }));
  const error = [...new Set(issues.map((i) => i.message))].join('; ');
  const res = new Response(JSON.stringify({ error, field: issues[0]?.field ?? null, issues }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
  throw new HTTPException(400, { message: error, res });
}

/** JSON body (empty body → {}); invalid JSON → 400. */
export async function readJson(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }
}

export const notFound = (what: string) => new HTTPException(404, { message: `${what} not found` });

// ---------------------------------------------------------------- schemas

const EngineIdSchema = z.enum(ENGINE_IDS);
const TierSchema = z.enum(['must_win', 'core', 'foundational']);
const IntentSchema = z.enum(['discovery', 'comparison', 'alternatives', 'how_to', 'branded']);
const name = z.string().trim().min(1).max(120);
const domain = z.string().trim().max(253).refine((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(normalizeDomain(d)), 'must be a domain like acme.com');
const optionalDomain = z.union([z.literal(''), domain]);
const aliases = z.array(z.string().trim().min(1).max(120)).max(20);

const CompetitorSchema = z.object({ name, domain: optionalDomain.optional(), aliases: aliases.optional() });
const CompetitorPatchSchema = z.object({
  name: name.optional(), domain: optionalDomain.optional(), aliases: aliases.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #e5560f').optional(),
});
const PromptSchema = z.object({
  text: z.string().trim().min(3).max(500),
  topic: z.string().trim().max(80).optional(),
  tier: TierSchema.optional(),
  intent: IntentSchema.optional(),
  active: z.boolean().optional(),
});
const PromptPatchSchema = PromptSchema.partial();
const ProjectFields = {
  name,
  domain,
  aliases: aliases.optional(),
  description: z.string().max(2000).optional(),
  industry: z.string().trim().max(120).optional(),
  market: z.string().trim().min(2).max(40).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  engines: z.array(EngineIdSchema).min(1).optional(),
  schedule: z.enum(['manual', 'daily', 'weekly']).optional(),
};
const ProjectSchema = z.object({
  ...ProjectFields,
  competitors: z.array(CompetitorSchema).max(20).optional(),
  prompts: z.array(PromptSchema).max(200).optional(),
});
const ProjectPatchSchema = z.object(ProjectFields).partial();
const SuggestSchema = z.object({ name, domain, description: z.string().max(2000).optional() });

function projectOr404(id: string) {
  const p = getProject(id);
  if (!p) throw notFound('Project');
  return p;
}

// ---------------------------------------------------------------- routes

const app = new Hono();

app.get('/projects', (c) => c.json(listProjects()));

app.post('/projects', async (c) => c.json(createProject(validate(ProjectSchema, await readJson(c))), 201));

app.post('/projects/suggest', async (c) => c.json(await suggestProject(validate(SuggestSchema, await readJson(c)))));

app.get('/projects/:id', (c) => c.json(projectOr404(c.req.param('id'))));

app.put('/projects/:id', async (c) => {
  const patch = validate(ProjectPatchSchema, await readJson(c));
  const p = updateProject(c.req.param('id'), patch);
  if (!p) throw notFound('Project');
  return c.json(p);
});

app.delete('/projects/:id', (c) => {
  if (!deleteProject(c.req.param('id'))) throw notFound('Project');
  return c.json({ ok: true });
});

app.get('/projects/:id/competitors', (c) => c.json(listCompetitors(projectOr404(c.req.param('id')).id)));

/** Accepts one competitor (→ Competitor) or an array (→ Competitor[]). */
app.post('/projects/:id/competitors', async (c) => {
  const p = projectOr404(c.req.param('id'));
  const body = validate(z.union([CompetitorSchema, z.array(CompetitorSchema).min(1).max(20)]), await readJson(c));
  const created = addCompetitors(p.id, Array.isArray(body) ? body : [body]);
  return c.json(Array.isArray(body) ? created : created[0], 201);
});

app.put('/competitors/:cid', async (c) => {
  const updated = updateCompetitor(c.req.param('cid'), validate(CompetitorPatchSchema, await readJson(c)));
  if (!updated) throw notFound('Competitor');
  return c.json(updated);
});

app.delete('/competitors/:cid', (c) => {
  if (!deleteCompetitor(c.req.param('cid'))) throw notFound('Competitor');
  return c.json({ ok: true });
});

app.get('/projects/:id/prompts', (c) => c.json(listPrompts(projectOr404(c.req.param('id')).id)));

/** Accepts one prompt or an array; always returns the created Prompt[] (duplicates of existing texts are skipped). */
app.post('/projects/:id/prompts', async (c) => {
  const p = projectOr404(c.req.param('id'));
  const body = validate(z.union([PromptSchema, z.array(PromptSchema).min(1).max(200)]), await readJson(c));
  return c.json(createPrompts(p.id, Array.isArray(body) ? body : [body]), 201);
});

app.put('/prompts/:pid', async (c) => {
  const updated = updatePrompt(c.req.param('pid'), validate(PromptPatchSchema, await readJson(c)));
  if (!updated) throw notFound('Prompt');
  return c.json(updated);
});

app.delete('/prompts/:pid', (c) => {
  if (!deletePrompt(c.req.param('pid'))) throw notFound('Prompt');
  return c.json({ ok: true });
});

app.post('/demo/seed', (c) => c.json(seedDemo(), 201));

export default app;
