// ai visibility on Cloudflare: this Worker fronts a single Cloudflare Container running the Node server (see Dockerfile).
//  - Static SPA files are served by Workers Static Assets (wrangler.jsonc); only /api/* and /px.js reach this code.
//  - Workspace API calls must carry a valid Cloudflare Access login (Access protects the hostname at the edge; the JWT
//    is checked again here so nothing reaches the app if Access is misconfigured — fails closed).
//  - Ingestion endpoints stay public so customer sites can report AI-crawler hits and AI referrals; each caller IP is
//    rate-limited here at the edge (server hits need the project's secret ingest token, checked by the server).
//  - A cron trigger every 5 minutes keeps the container awake, so its in-process scheduler and batch poller keep running.
import { Container, getContainer } from '@cloudflare/containers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Bindings, vars and secret names come from wrangler.example.jsonc and .env.example (generated: worker-configuration.d.ts).
declare global {
  interface Env {
    /** e.g. https://<team>.cloudflareaccess.com — set once the Access application exists. */
    ACCESS_TEAM_DOMAIN?: string;
    /** Audience tag of the Access application. */
    ACCESS_AUD?: string;
  }
}

const PASS_THROUGH = [
  'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY',
] as const;

export class OvertContainer extends Container<Env> {
  defaultPort = 8080;
  // The cron below pings every 5 minutes; this only matters if the cron is removed.
  sleepAfter = '2h';
  enableInternet = true;
  envVars: Record<string, string> = {
    ALLOWED_HOSTS: this.env.PUBLIC_HOSTNAME,
    ...Object.fromEntries(PASS_THROUGH.map((k) => [k, this.env[k] ?? '']).filter(([, v]) => v !== '')),
  };
}

/** Reachable without an Access login: health, AI-crawler ingestion, referral pixel + beacon. */
const isPublic = (path: string) =>
  path === '/api/health' || path === '/px.js' || path.startsWith('/api/ingest/') || path.startsWith('/api/collect/');

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function hasAccessLogin(request: Request, env: Env): Promise<boolean> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return false;
  jwks ??= createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
  try {
    await jwtVerify(token, jwks, { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
    return true;
  } catch {
    return false;
  }
}

const overt = (env: Env) => getContainer(env.OVERT, 'overt');

/** Per-IP edge limits: server-side ingestion per site key, and pixel beacons (one per page view for real visitors). */
async function withinEdgeLimit(path: string, request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (path.startsWith('/api/ingest/')) return (await env.INGEST_LIMITER.limit({ key: `${ip}:${path.split('/')[3] ?? ''}` })).success;
  if (path.startsWith('/api/collect/')) return (await env.BEACON_LIMITER.limit({ key: ip })).success;
  return true;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (isPublic(url.pathname) && !(await withinEdgeLimit(url.pathname, request, env))) {
      return Response.json({ error: 'Too many requests — slow down and retry in a minute' }, { status: 429, headers: { 'retry-after': '60' } });
    }
    if (!isPublic(url.pathname) && !(await hasAccessLogin(request, env))) {
      const configured = !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
      return Response.json({ error: configured ? 'Sign in through Cloudflare Access to use this workspace' : 'Access is not configured yet' }, { status: 403 });
    }
    return overt(env).fetch(request);
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(overt(env).fetch(new Request(`https://${env.PUBLIC_HOSTNAME}/api/health`)).then((r) => {
      if (!r.ok) console.error('[cron] health check failed', r.status);
    }));
  },
} satisfies ExportedHandler<Env>;
