// AI-readiness audit endpoints.
import { Hono } from 'hono';
import { z } from 'zod';
import { getProject } from '../services/projects.ts';
import { ensureAudit, listAudits, normalizeAuditUrl, runAudit } from '../audit/index.ts';

const app = new Hono();

const AuditBody = z.object({ url: z.string().trim().max(2048).optional() });

app.post('/projects/:id/audit', async (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const raw = await c.req.text();
  let json: unknown = {};
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      return c.json({ error: 'Body must be JSON: { "url"?: string }' }, 400);
    }
  }
  const body = AuditBody.safeParse(json);
  if (!body.success) return c.json({ error: 'Body must be JSON: { "url"?: string }' }, 400);
  const url = body.data.url || undefined;
  if (url && !normalizeAuditUrl(url)) return c.json({ error: `Invalid URL: ${url}` }, 400);
  return c.json(await runAudit(project, url));
});

app.get('/projects/:id/audits/latest', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(ensureAudit(project));
});

app.get('/projects/:id/audits', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  ensureAudit(project);
  return c.json(listAudits(project.id));
});

export default app;
