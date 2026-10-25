// Server entry. Routes live in their own route modules, not here.
import './env.ts';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from './db/index.ts';
import settings from './routes/settings.ts';
import projects from './routes/projects.ts';
import runs from './routes/runs.ts';
import monitor from './routes/monitor.ts';
import insights from './routes/insights.ts';
import audit from './routes/audit.ts';
import crawlers from './routes/crawlers.ts';
import ingest from './routes/ingest.ts';
import { startScheduler } from './services/scheduler.ts';
import { backfillIngestTokens } from './services/projects.ts';
import { startIpVerification } from './crawlers/verify.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4400);
const WEB_DIST = resolve(process.env.WEB_DIST ?? join(here, '../../web/dist'));

const app = new Hono();
if (process.env.NODE_ENV !== 'production') app.use('/api/*', logger());

// Public ingestion endpoints (called from customers' servers/sites) need open CORS.
app.use('/api/ingest/*', cors({ origin: '*' }));
app.use('/api/collect/*', cors({ origin: '*' }));
app.use('/px.js', cors({ origin: '*' }));

// Public endpoints (health, ingestion, pixel) stay open so customer sites can report hits; everything else
// (API, SPA, static files) goes through the guards below.
const isPublic = (path: string) =>
  path === '/api/health' || path === '/px.js' || path.startsWith('/api/ingest/') || path.startsWith('/api/collect/');

// Optional workspace protection for deployments: set APP_USER + APP_PASSWORD.
const APP_USER = process.env.APP_USER;
const APP_PASSWORD = process.env.APP_PASSWORD;
if (APP_USER && APP_PASSWORD) {
  const auth = basicAuth({ username: APP_USER, password: APP_PASSWORD, realm: 'ai visibility' });
  app.use('*', (c, next) => (isPublic(c.req.path) ? next() : auth(c, next)));
} else {
  // Without auth the workspace answers only to loopback host names (plus ALLOWED_HOSTS), so a DNS-rebinding page
  // can't drive it from a victim's browser.
  const allowed = new Set((process.env.ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
  const LOOPBACK = /^(?:localhost|[\w-]+\.localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;
  app.use('*', async (c, next) => {
    if (isPublic(c.req.path)) return next();
    const host = (c.req.header('host') ?? '').toLowerCase().replace(/:\d+$/, '');
    if (LOOPBACK.test(host) || allowed.has(host)) return next();
    return c.json({ error: `Host "${host.slice(0, 100)}" not allowed — set APP_USER/APP_PASSWORD to serve this workspace on a public host name (or list it in ALLOWED_HOSTS)` }, 403);
  });
}

// Workspace pages and API responses: no MIME sniffing, no framing by other sites (clickjacking).
app.use('*', async (c, next) => {
  await next();
  if (isPublic(c.req.path)) return;
  c.header('x-content-type-options', 'nosniff');
  c.header('x-frame-options', 'SAMEORIGIN');
});

// CSRF: browsers attach basic-auth credentials to cross-site requests, and "simple" POSTs (text/plain, forms) skip
// the CORS preflight — so refuse state-changing workspace calls that the browser marks as coming from another site.
const sameOrigin = (c: Context) => {
  const site = c.req.header('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = c.req.header('origin');
  if (!origin) return true; // non-browser clients (curl, scripts)
  try {
    const host = c.req.header('x-forwarded-host')?.split(',')[0]?.trim() || c.req.header('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS' || isPublic(c.req.path) || sameOrigin(c)) return next();
  return c.json({ error: 'Cross-site request refused' }, 403);
});

// Workspace API bodies are small JSON (largest: a 500k-char draft). Log uploads and public ingestion set their own caps.
const apiBodyLimit = bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: 'Request body too large (max 4 MB)' }, 413) });
app.use('/api/*', (c, next) => (isPublic(c.req.path) || /^\/api\/projects\/[^/]+\/logs$/.test(c.req.path) ? next() : apiBodyLimit(c, next)));

app.get('/api/health', (c) => c.json({ ok: true, version: '0.1.0', time: new Date().toISOString() }));

// Public (ingest) first, then app API.
app.route('/', ingest);
app.route('/api', settings);
app.route('/api', projects);
app.route('/api', runs);
app.route('/api', monitor);
app.route('/api', insights);
app.route('/api', audit);
app.route('/api', crawlers);

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404)));
// Client errors (HTTPException / errors carrying a 4xx status) keep their message; anything else is logged and
// answered with a generic 500 so internals (SQL, stack details) never reach the client.
app.onError((err, c) => {
  // Exceptions that carry a full response (basic auth's 401 with WWW-Authenticate) are passed through as-is.
  if (err instanceof HTTPException && err.res) return err.getResponse();
  const status = err instanceof HTTPException ? err.status : (err as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) return c.json({ error: err.message || 'Bad request' }, status as 400);
  console.error('[error]', c.req.method, c.req.path, err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Production: serve the built SPA with client-side routing fallback.
if (existsSync(WEB_DIST)) {
  const root = relative(process.cwd(), WEB_DIST);
  app.use('/*', serveStatic({ root }));
  const indexHtml = readFileSync(join(WEB_DIST, 'index.html'), 'utf8');
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.html(indexHtml)));
}

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
  backfillIngestTokens();
  startScheduler();
  startIpVerification();
});

// Background work (runs, scheduler) logs its own failures; never let a stray rejection kill the server.
process.on('unhandledRejection', (err) => console.error('[unhandled rejection]', err));

// Graceful shutdown: stop accepting connections, then close the database (checkpoints the WAL).
// Interrupted runs are resumed or marked failed at the next boot (recoverRuns).
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);
  const exit = () => {
    try {
      db.close();
    } catch {
      // already closed
    }
    process.exit(0);
  };
  server.close(exit);
  setTimeout(exit, 3000).unref();
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

export default app;
