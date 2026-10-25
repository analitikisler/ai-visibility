// Copy-paste integration snippets. Every snippet is fire-and-forget (never delays the customer's response) and only
// forwards requests whose UA looks like a bot or whose referrer is external — the server does the exact classification.
// Server-side snippets authenticate with the project's secret ingest token (AI_VISIBILITY_INGEST_TOKEN); the referral pixel
// uses only the public site key.
import type { IntegrationInfo, Project } from '../../../shared/types.ts';
import { ingestTokenOf } from '../services/projects.ts';
import { lastEventAt } from './overview.ts';
import { pixelTag } from './pixel.ts';

/** Coarse "looks like a bot / AI fetcher" test shared by all snippets (covers every UA-detectable catalog agent). */
export const SNIPPET_BOT_RE = /bot|crawl|spider|slurp|fetcher|-user|agent|chatgpt|openai|perplexity|claude|anthropic|facebookexternalhit|google-|googleother|meta-|mistral|cohere|omgili|yandex|siteaudit/i;
const BOT_RE = SNIPPET_BOT_RE.toString();
/** grep -E equivalent for log shipping; also catches AI-assistant referrers (chatgpt.com, gemini.google.com, …). */
const GREP_RE = 'bot|crawl|spider|slurp|fetcher|-user|agent|chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|facebookexternalhit|google-|googleother|meta-|mistral|cohere';

function express(ingestUrl: string): string {
  return `// ai-visibility.js — Express middleware (Node 18+). Forwards bot hits and external referrals to ai visibility
// after the response has finished; failures are ignored, so your site is never slowed down.
const INGEST_URL = '${ingestUrl}';
const INGEST_TOKEN = process.env.AI_VISIBILITY_INGEST_TOKEN; // secret — set it in your server's environment
const BOT_RE = ${BOT_RE};

export function aiVisibility(req, res, next) {
  const userAgent = req.get('user-agent') || '';
  const signatureAgent = req.get('signature-agent') || ''; // ChatGPT agent signs requests but uses a normal Chrome UA
  const referrer = req.get('referer') || '';
  let external = false;
  try { external = !!referrer && new URL(referrer).host !== req.get('host'); } catch {}
  if (BOT_RE.test(userAgent) || signatureAgent || external) {
    res.on('finish', () => {
      fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: \`Bearer \${INGEST_TOKEN}\` },
        body: JSON.stringify({ url: req.originalUrl, userAgent, signatureAgent, ip: req.ip, referrer, status: res.statusCode, ts: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    });
  }
  next();
}

// In your app:
//   import { aiVisibility } from './ai-visibility.js';
//   app.set('trust proxy', true); // behind a load balancer/CDN, so req.ip is the client IP
//   app.use(aiVisibility);
`;
}

function nextjs(ingestUrl: string): string {
  return `// middleware.ts (project root or src/). Next.js 16+: name the file proxy.ts and the function \`proxy\`.
// If you already have middleware, add the block inside \`if (...)\` to it.
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

const INGEST_URL = '${ingestUrl}';
const INGEST_TOKEN = process.env.AI_VISIBILITY_INGEST_TOKEN; // secret — add it to your environment variables
const BOT_RE = ${BOT_RE};

export function middleware(req: NextRequest, event: NextFetchEvent) {
  const userAgent = req.headers.get('user-agent') ?? '';
  const signatureAgent = req.headers.get('signature-agent') ?? ''; // ChatGPT agent: Chrome UA + signed requests
  const referrer = req.headers.get('referer') ?? '';
  let external = false;
  try { external = !!referrer && new URL(referrer).host !== req.nextUrl.host; } catch {}
  if (BOT_RE.test(userAgent) || signatureAgent || external) {
    // waitUntil lets the request finish in the background — the response is not delayed.
    event.waitUntil(
      fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: \`Bearer \${INGEST_TOKEN}\` },
        body: JSON.stringify({
          url: req.nextUrl.pathname + req.nextUrl.search,
          userAgent,
          signatureAgent,
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
          referrer,
          ts: new Date().toISOString(),
        }),
      }).catch(() => {}),
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
`;
}

function cloudflare(ingestUrl: string): string {
  return `// Cloudflare Worker bound to a route in front of your site (e.g. example.com/*).
// The visitor gets the origin response immediately; reporting runs in ctx.waitUntil.
// Store the token as a secret: npx wrangler secret put AI_VISIBILITY_INGEST_TOKEN
const INGEST_URL = '${ingestUrl}';
const BOT_RE = ${BOT_RE};

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request); // pass through to your origin
    const userAgent = request.headers.get('user-agent') || '';
    const signatureAgent = request.headers.get('signature-agent') || ''; // ChatGPT agent: Chrome UA + signed requests
    const referrer = request.headers.get('referer') || '';
    const url = new URL(request.url);
    let external = false;
    try { external = !!referrer && new URL(referrer).host !== url.host; } catch {}
    if (BOT_RE.test(userAgent) || signatureAgent || external) {
      ctx.waitUntil(
        fetch(INGEST_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: \`Bearer \${env.AI_VISIBILITY_INGEST_TOKEN}\` },
          body: JSON.stringify({
            url: url.pathname + url.search,
            userAgent,
            signatureAgent,
            ip: request.headers.get('cf-connecting-ip') || '',
            referrer,
            status: response.status,
            ts: new Date().toISOString(),
          }),
        }).catch(() => {}),
      );
    }
    return response;
  },
};
`;
}

function vercel(ingestUrl: string): string {
  return `// middleware.ts at the project root — Vercel Routing Middleware (any framework).
// Requires: npm i @vercel/functions
import { waitUntil } from '@vercel/functions';

const INGEST_URL = '${ingestUrl}';
const INGEST_TOKEN = process.env.AI_VISIBILITY_INGEST_TOKEN; // secret — add it under Project → Settings → Environment Variables
const BOT_RE = ${BOT_RE};

export const config = { matcher: '/((?!_next/|assets/|favicon.ico).*)' };

export default function middleware(request: Request) {
  const userAgent = request.headers.get('user-agent') || '';
  const signatureAgent = request.headers.get('signature-agent') || ''; // ChatGPT agent: Chrome UA + signed requests
  const referrer = request.headers.get('referer') || '';
  const url = new URL(request.url);
  let external = false;
  try { external = !!referrer && new URL(referrer).host !== url.host; } catch {}
  if (BOT_RE.test(userAgent) || signatureAgent || external) {
    waitUntil(
      fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: \`Bearer \${INGEST_TOKEN}\` },
        body: JSON.stringify({
          url: url.pathname + url.search,
          userAgent,
          signatureAgent,
          ip: request.headers.get('x-real-ip') || '',
          referrer,
          ts: new Date().toISOString(),
        }),
      }).catch(() => {}),
    );
  }
  // Returning nothing lets the request continue to your app unchanged.
}
`;
}

function nginx(logsUrl: string, token: string): string {
  return `# Nginx (or Apache) log shipping — no changes to your server config or request path.
# 1) Keep the standard "combined" log format (Nginx default; Apache: CustomLog ... combined):
#      access_log /var/log/nginx/access.log combined;
#    Optional — to also detect ChatGPT agent (normal Chrome UA, identified by its Signature-Agent header),
#    append that header as the last field:
#      log_format ai_visibility '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent '
#                       '"$http_referer" "$http_user_agent" "$http_signature_agent"';
#      access_log /var/log/nginx/access.log ai_visibility;
# 2) Save as /etc/cron.d/ai-visibility-logs (readable by root only — it contains your secret ingest token). Every 15 min it uploads bot & AI-referral lines; lines that were already
#    uploaded are de-duplicated server-side, so overlapping uploads are safe. Uploads are capped at 20 MB.
*/15 * * * * root grep -aiE '${GREP_RE}' /var/log/nginx/access.log | tail -n 50000 | curl -sS -m 120 -X POST -H 'content-type: text/plain' -H 'authorization: Bearer ${token}' --data-binary @- '${logsUrl}' > /dev/null 2>&1

# One-off backfill of a rotated log:
#   zcat /var/log/nginx/access.log.2.gz | grep -aiE '${GREP_RE}' | curl -sS -X POST -H 'content-type: text/plain' -H 'authorization: Bearer ${token}' --data-binary @- '${logsUrl}'
`;
}

function curl(ingestUrl: string, token: string): string {
  const ts = new Date().toISOString().slice(0, 19) + 'Z';
  return `# Send hits from any stack: one event or an array of up to 1000.
curl -X POST '${ingestUrl}' \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer ${token}' \\
  -d '[
    {"url": "/pricing", "userAgent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot", "ip": "20.171.207.10", "status": 200, "ts": "${ts}"},
    {"url": "/blog/guide?utm_source=chatgpt.com", "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15", "referrer": "https://chatgpt.com/"}
  ]'
# => {"accepted":2,"bots":1,"referrals":1,"skipped":0}
`;
}

export function getIntegrationInfo(project: Project, origin: string): IntegrationInfo {
  const ingestToken = ingestTokenOf(project.id) ?? '';
  const ingestUrl = `${origin}/api/ingest/${project.siteKey}`;
  const logsUrl = `${origin}/api/ingest/${project.siteKey}/logs`;
  const pixel = pixelTag(origin, project.siteKey);
  return {
    siteKey: project.siteKey,
    ingestToken,
    ingestUrl,
    pixelScript: pixel,
    snippets: [
      { id: 'pixel', name: 'AI referral pixel (HTML)', language: 'html', code: `<!-- Add before </head>. Tracks visitors arriving from ChatGPT, Perplexity, Gemini, Copilot, Claude… (~1 KB, no cookies) -->\n${pixel}\n` },
      { id: 'express', name: 'Express / Node.js', language: 'javascript', code: express(ingestUrl) },
      { id: 'nextjs', name: 'Next.js middleware', language: 'typescript', code: nextjs(ingestUrl) },
      { id: 'cloudflare', name: 'Cloudflare Worker', language: 'javascript', code: cloudflare(ingestUrl) },
      { id: 'vercel', name: 'Vercel Edge (Routing Middleware)', language: 'typescript', code: vercel(ingestUrl) },
      { id: 'nginx', name: 'Nginx / Apache logs (cron)', language: 'bash', code: nginx(logsUrl, ingestToken) },
      { id: 'curl', name: 'cURL / any backend', language: 'bash', code: curl(ingestUrl, ingestToken) },
    ],
    lastEventAt: lastEventAt(project.id),
  };
}
