// Crawler analytics, AI referrals, log uploads, integration snippets and the agent catalog.
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { getProject, rotateIngestToken } from '../services/projects.ts';
import { agentCatalog, ALL_CATEGORIES } from '../crawlers/catalog.ts';
import { getCrawlerOverview, getReferralOverview, listBotEvents } from '../crawlers/overview.ts';
import { ingestLogUpload, LOG_TOO_LARGE, MAX_LOG_BYTES } from '../crawlers/logs.ts';
import { getIntegrationInfo } from '../crawlers/integration.ts';

const app = new Hono();

const DaysQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
const EventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  agent: z.string().max(100).optional(),
  category: z.enum(ALL_CATEGORIES as [string, ...string[]]).optional(),
  operator: z.string().max(100).optional(),
  path: z.string().max(500).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  verification: z.enum(['verified', 'unverified', 'spoofed']).optional(),
});

function badQuery(c: Context, err: z.ZodError) {
  return c.json({ error: `Invalid query: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` }, 400);
}

const HOST_RE = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

/**
 * Public origin of this server as the caller sees it (respects reverse-proxy headers). Header values are validated
 * because they are pasted into code snippets.
 */
function requestOrigin(c: Context): string {
  const url = new URL(c.req.url);
  const fwdHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim() || c.req.header('host') || '';
  const fwdProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() ?? '';
  const host = HOST_RE.test(fwdHost) ? fwdHost : url.host;
  const proto = fwdProto === 'http' || fwdProto === 'https' ? fwdProto : url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

app.get('/agents', (c) => c.json(agentCatalog()));

app.get('/projects/:id/crawlers/overview', async (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const q = DaysQuery.safeParse(c.req.query());
  if (!q.success) return badQuery(c, q.error);
  return c.json(await getCrawlerOverview(project, q.data.days));
});

app.get('/projects/:id/crawlers/events', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const q = EventsQuery.safeParse(c.req.query());
  if (!q.success) return badQuery(c, q.error);
  return c.json(listBotEvents(project.id, q.data));
});

app.get('/projects/:id/referrals/overview', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  const q = DaysQuery.safeParse(c.req.query());
  if (!q.success) return badQuery(c, q.error);
  return c.json(getReferralOverview(project.id, q.data.days));
});

app.post(
  '/projects/:id/logs',
  bodyLimit({ maxSize: MAX_LOG_BYTES, onError: (c) => c.json({ error: LOG_TOO_LARGE }, 413) }),
  async (c) => {
    const project = getProject(c.req.param('id'));
    if (!project) return c.json({ error: 'Project not found' }, 404);
    const { ok, ...result } = ingestLogUpload(project.id, await c.req.text(), c.req.header('content-type') ?? '');
    return c.json(result, ok ? 200 : 400);
  },
);

app.get('/projects/:id/integration', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(getIntegrationInfo(project, requestOrigin(c)));
});

/** Issues a new ingest token (the old one stops working at once) and returns the updated integration info. */
app.post('/projects/:id/integration/token', (c) => {
  const project = getProject(c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  rotateIngestToken(project.id);
  return c.json(getIntegrationInfo(project, requestOrigin(c)));
});

export default app;
