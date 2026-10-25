// Diagnose / Plan / Act / Report endpoints.
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { getProject } from '../services/projects.ts';
import { computeDiagnosis, getDiagnosis } from '../services/diagnose.ts';
import { listRecommendations, setRecommendationStatus } from '../services/recommendations.ts';
import { createDraft, deleteDraft, DraftError, listDrafts, updateDraft } from '../services/drafts.ts';
import { buildReport, EXPORT_KINDS, exportCsv, type ExportKind } from '../services/report.ts';

const app = new Hono();

const DRAFT_KINDS = ['llms_txt', 'comparison_page', 'faq_page', 'content_brief', 'robots_txt', 'schema_jsonld', 'outreach_email'] as const;
const DraftRequestSchema = z.object({
  kind: z.enum(DRAFT_KINDS),
  params: z.record(z.string(), z.string().max(2000)).optional(),
});
const DraftPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    body: z.string().max(500_000).optional(),
    status: z.enum(['draft', 'approved', 'published', 'dismissed']).optional(),
  })
  .refine((p) => p.title !== undefined || p.body !== undefined || p.status !== undefined, { message: 'Nothing to update' });
const RecStatusSchema = z.object({ status: z.enum(['open', 'in_progress', 'done', 'dismissed']) });
const DaysSchema = (def: number) => z.object({ days: z.coerce.number().int().min(1).max(365).default(def) });

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
const invalid = (c: Context, err: z.ZodError) => c.json({ error: `Invalid input: ${err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')}` }, 400);

// ?days= (default 30) sets the analysis window for diagnose and recommendations (the report passes its own window).
app.get('/projects/:id/diagnose', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const q = DaysSchema(30).safeParse(c.req.query());
  if (!q.success) return invalid(c, q.error);
  return c.json(getDiagnosis(project, q.data.days));
});

app.get('/projects/:id/recommendations', async (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const q = DaysSchema(30).safeParse(c.req.query());
  if (!q.success) return invalid(c, q.error);
  return c.json(await listRecommendations(project, computeDiagnosis(project, q.data.days)));
});

app.put('/projects/:id/recommendations/:key', async (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const q = DaysSchema(30).safeParse(c.req.query());
  if (!q.success) return invalid(c, q.error);
  const body = RecStatusSchema.safeParse(await jsonBody(c));
  if (!body.success) return invalid(c, body.error);
  const rec = await setRecommendationStatus(project, c.req.param('key'), body.data.status, q.data.days);
  return rec ? c.json(rec) : c.json({ error: 'Recommendation not found (it may no longer apply)' }, 404);
});

app.get('/projects/:id/drafts', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(listDrafts(project.id));
});

app.post('/projects/:id/drafts', async (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const body = DraftRequestSchema.safeParse(await jsonBody(c));
  if (!body.success) return invalid(c, body.error);
  try {
    return c.json(await createDraft(project, body.data));
  } catch (err) {
    if (err instanceof DraftError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

app.put('/drafts/:did', async (c) => {
  const body = DraftPatchSchema.safeParse(await jsonBody(c));
  if (!body.success) return invalid(c, body.error);
  const draft = updateDraft(c.req.param('did'), body.data);
  return draft ? c.json(draft) : c.json({ error: 'Draft not found' }, 404);
});

app.delete('/drafts/:did', (c) => (deleteDraft(c.req.param('did')) ? c.json({ ok: true }) : c.json({ error: 'Draft not found' }, 404)));

app.get('/projects/:id/report', async (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const q = DaysSchema(7).safeParse(c.req.query());
  if (!q.success) return invalid(c, q.error);
  return c.json(await buildReport(project, q.data.days));
});

// GET /projects/:id/export/:kind.csv  (kind = responses | mentions | citations | bot_events | prompts), optional ?days=90
app.get('/projects/:id/export/:file', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const kind = c.req.param('file').replace(/\.csv$/i, '') as ExportKind;
  if (!c.req.param('file').toLowerCase().endsWith('.csv') || !EXPORT_KINDS.includes(kind)) {
    return c.json({ error: `Unknown export — use one of: ${EXPORT_KINDS.map((k) => `${k}.csv`).join(', ')}` }, 400);
  }
  const q = DaysSchema(90).safeParse(c.req.query());
  if (!q.success) return invalid(c, q.error);
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename="${slug}-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  c.header('cache-control', 'no-store');
  return c.body(exportCsv(project, kind, q.data.days));
});

export default app;
