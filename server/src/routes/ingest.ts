// Public ingestion endpoints (open CORS, mounted at root): server-side hits, pixel beacons, and the pixel script.
// Server-side hits and log shipping need the project's secret ingest token (Authorization: Bearer …); the pixel beacon
// only needs the site key, which is public on customers' pages, so it can only record AI referral visits.
// Abuse limits: body size caps, batch cap, per-field caps, timestamp window, per-site request and event budgets,
// per-visitor limits on the beacon, and daily caps per project (crawlers/record.ts). On Cloudflare the Worker also
// rate-limits each caller IP at the edge before requests reach this server.
import type { Context } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { get } from '../db/index.ts';
import { normalizePath, normalizeTs, recordHits, type Hit } from '../crawlers/record.ts';
import { pixelScript } from '../crawlers/pixel.ts';
import { ingestLogUpload, LOG_TOO_LARGE, MAX_LOG_BYTES } from '../crawlers/logs.ts';
import { RateLimiter } from '../lib/rate-limit.ts';

const app = new Hono();
const MAX_BATCH = 1000;
/** Real-time hits older than this are rejected (log uploads use their own, longer window). */
const MAX_INGEST_AGE_DAYS = 90;

/** Hits per site: 50 requests/s sustained, bursts of 200. Log shipping: bursts of 10, one upload per 6 s after that. */
const hitLimiter = new RateLimiter(50, 200);
const logLimiter = new RateLimiter(1 / 6, 10);
/** Events per site across batches: 500/s sustained, bursts of 5,000 (two full batches). */
const eventLimiter = new RateLimiter(500, 5000);
/** Beacons per visitor IP and site: a real visitor sends one per page view. */
const visitorLimiter = new RateLimiter(1, 20, 50_000);

/** Strings are rejected above `hardMax` and truncated to `keep` (so a long query string doesn't drop the hit). */
const capped = (keep: number, hardMax = 8192) => z.string().max(hardMax).transform((s) => s.slice(0, keep));

const IngestEventSchema = z.object({
  url: capped(2048).nullish(),
  path: capped(2048).nullish(),
  userAgent: capped(512),
  ip: z.string().max(128).nullish(),
  referrer: capped(2048).nullish(),
  status: z.coerce.number().int().min(100).max(599).nullish(),
  ts: z.string().max(64).nullish(),
  signatureAgent: capped(512).nullish(),
});

const BeaconSchema = z.object({
  p: capped(2048).optional(),
  r: capped(2048).optional(),
  u: capped(2048).optional(),
  s: z.string().max(64).optional(),
});

const limit = (bytes: number, label: string) => bodyLimit({ maxSize: bytes, onError: (c) => c.json({ error: `Payload exceeds ${label}` }, 413) });

interface SiteRow { id: string; ingest_token: string | null }

/** Project for a site key, or null. Malformed keys never reach the database. */
function projectForKey(siteKey: string): SiteRow | null {
  if (!/^[\w-]{1,64}$/.test(siteKey)) return null;
  return get<SiteRow>('SELECT id, ingest_token FROM projects WHERE site_key = ?', [siteKey]) ?? null;
}

/** Constant-time check of `Authorization: Bearer <ingest token>`. */
function hasIngestToken(c: Context, expected: string | null): boolean {
  const given = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1] ?? '';
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const tooMany = (c: Context, wait: number, what: string) => {
  c.header('retry-after', String(wait));
  return c.json({ error: `Too many ${what} — slow down and retry later` }, 429);
};

/**
 * Resolves the site key, checks the ingest token when `token` is set, and applies the request rate limit.
 * Returns the project id or a ready error response.
 */
function admit(c: Context, limiter: RateLimiter, opts: { token: boolean }): string | Response {
  const site = projectForKey(c.req.param('siteKey') ?? '');
  if (!site) return c.json({ error: 'Unknown site key' }, 404);
  if (opts.token && !hasIngestToken(c, site.ingest_token)) {
    return c.json({ error: 'Missing or wrong ingest token — send Authorization: Bearer <token> (Integrations page)' }, 401);
  }
  const wait = limiter.take(site.id);
  return wait ? tooMany(c, wait, 'requests for this site') : site.id;
}

/** Caller IP as seen by Cloudflare (or a local proxy); '' when unknown. */
const callerIp = (c: Context) => (c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0] ?? '').trim().slice(0, 64);

app.post('/api/ingest/:siteKey', limit(5 * 1024 * 1024, '5 MB'), async (c) => {
  const projectId = admit(c, hitLimiter, { token: true });
  if (typeof projectId !== 'string') return projectId;
  let body: unknown;
  try {
    body = JSON.parse(await c.req.text());
  } catch {
    return c.json({ error: 'Body must be JSON: an IngestEvent or an array of IngestEvents' }, 400);
  }
  const items = Array.isArray(body) ? body : [body];
  if (items.length > MAX_BATCH) return c.json({ error: `At most ${MAX_BATCH} events per batch (got ${items.length})` }, 400);
  if (!items.length) return c.json({ accepted: 0, bots: 0, referrals: 0, skipped: 0 });
  const wait = eventLimiter.take(projectId, items.length);
  if (wait) return tooMany(c, wait, 'events for this site');

  const hits: Hit[] = [];
  let skipped = 0;
  for (const item of items) {
    const p = IngestEventSchema.safeParse(item);
    const ts = p.success ? normalizeTs(p.data.ts ?? undefined, MAX_INGEST_AGE_DAYS) : null;
    if (!p.success || !ts) {
      skipped++;
      continue;
    }
    const e = p.data;
    hits.push({
      ts,
      path: normalizePath(e.path ?? e.url ?? '/'),
      url: e.url ?? e.path ?? undefined,
      userAgent: e.userAgent,
      ip: e.ip ?? '',
      referrer: e.referrer ?? '',
      status: e.status ?? null,
      signatureAgent: e.signatureAgent ?? undefined,
    });
  }
  if (!hits.length) {
    return c.json({ error: `No valid events — each event needs a userAgent string and a ts within the last ${MAX_INGEST_AGE_DAYS} days`, skipped }, 400);
  }
  const r = recordHits(projectId, hits, 'ingest');
  return c.json({ accepted: hits.length, bots: r.bots, referrals: r.referrals, skipped, ...(r.capped ? { capped: r.capped } : {}) });
});

// Public log shipping (e.g. the Nginx cron snippet): site key instead of project id, same parser and caps as the in-app uploader.
app.post(
  '/api/ingest/:siteKey/logs',
  bodyLimit({ maxSize: MAX_LOG_BYTES, onError: (c) => c.json({ error: LOG_TOO_LARGE }, 413) }),
  async (c) => {
    const projectId = admit(c, logLimiter, { token: true });
    if (typeof projectId !== 'string') return projectId;
    const { ok, ...result } = ingestLogUpload(projectId, await c.req.text(), c.req.header('content-type') ?? '');
    return c.json(result, ok ? 200 : 400);
  },
);

// Beacon from px.js (sendBeacon posts text/plain JSON). Always 204 for known keys; the server decides what counts.
// Public key only, so it records AI referral visits and nothing else; one visitor can't send more than a page view's worth.
app.post('/api/collect/:siteKey', limit(16 * 1024, '16 KB'), async (c) => {
  const projectId = admit(c, hitLimiter, { token: false });
  if (typeof projectId !== 'string') return projectId;
  const visitorWait = visitorLimiter.take(`${projectId}|${callerIp(c) || 'unknown'}`);
  if (visitorWait) return tooMany(c, visitorWait, 'beacons from this visitor');
  let parsed: z.infer<typeof BeaconSchema>;
  try {
    const p = BeaconSchema.safeParse(JSON.parse(await c.req.text()));
    if (!p.success) return c.json({ error: 'Invalid beacon payload' }, 400);
    parsed = p.data;
  } catch {
    return c.json({ error: 'Invalid beacon payload' }, 400);
  }
  recordHits(projectId, [{
    ts: new Date().toISOString(),
    path: normalizePath(parsed.p || parsed.u),
    url: parsed.u || parsed.p,
    userAgent: (c.req.header('user-agent') ?? '').slice(0, 512),
    ip: '',
    referrer: parsed.r ?? '',
    status: null,
    sessionId: parsed.s,
  }], 'pixel', { referralsOnly: true });
  return c.body(null, 204);
});

app.get('/px.js', (c) => {
  c.header('content-type', 'application/javascript; charset=utf-8');
  c.header('cache-control', 'public, max-age=3600, stale-while-revalidate=86400');
  c.header('x-content-type-options', 'nosniff');
  return c.body(pixelScript());
});

export default app;
