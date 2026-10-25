// Server-rendered homepage analysis (what a non-JS AI crawler actually sees).
import * as cheerio from 'cheerio';

export interface PageAnalysis {
  title: string;
  metaDescription: string;
  h1: string[];
  wordCount: number;
  schemaTypes: string[];
  jsonLdBlocks: number;
  jsonLdErrors: number;
  ogTags: Record<string, string>;
  canonical: string | null;
  lang: string | null;
  robotsMeta: string;          // combined robots/googlebot/bingbot meta content, lowercased
  noindex: boolean;
  nosnippet: boolean;
  noai: boolean;
  spaShell: boolean;           // empty #root/#app/#__next mount point
  internalPaths: string[];     // same-host link paths (for robots sampling)
}

const ASSET_RE = /\.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|pdf|zip|mp4|webm|mp3|xml|json|txt)$/i;
const PRIVATE_RE = /^\/(?:admin|login|signin|sign-in|signup|sign-up|logout|cart|checkout|account|api|wp-admin|search)(?:\/|$)/i;

/** Collects schema.org @type values from parsed JSON-LD (top level, @graph and nested objects up to depth 4). */
function collectTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (depth > 4 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  for (const v of Array.isArray(t) ? t : [t]) {
    if (typeof v === 'string' && v) out.add(v.replace(/^https?:\/\/schema\.org\//i, ''));
  }
  for (const [k, v] of Object.entries(obj)) if (k !== '@context' && typeof v === 'object') collectTypes(v, out, depth + 1);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function analyzeHtml(html: string, pageUrl: string): PageAnalysis {
  const $ = cheerio.load(html);
  const base = (() => {
    try {
      return new URL(pageUrl);
    } catch {
      return null;
    }
  })();

  const types = new Set<string>();
  let jsonLdBlocks = 0;
  let jsonLdErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLdBlocks++;
    const raw = $(el).text().trim();
    try {
      collectTypes(JSON.parse(raw), types);
    } catch {
      jsonLdErrors++;
    }
  });
  $('[itemtype]').each((_, el) => {
    const t = ($(el).attr('itemtype') ?? '').split(/\s+/)[0] ?? '';
    const m = /schema\.org\/(\w+)/i.exec(t);
    if (m) types.add(m[1]!);
  });

  const ogTags: Record<string, string> = {};
  // `property` is the OpenGraph spec; many sites (e.g. MDN) use `name`, which consumers accept too.
  $('meta[property^="og:"], meta[name^="og:"]').each((_, el) => {
    const p = $(el).attr('property') ?? $(el).attr('name');
    const c = $(el).attr('content');
    if (p && c && !(p in ogTags)) ogTags[p] = c.trim().slice(0, 300);
  });

  const robotsMeta = $('meta[name="robots" i], meta[name="googlebot" i], meta[name="bingbot" i]')
    .map((_, el) => ($(el).attr('content') ?? '').toLowerCase())
    .get()
    .join(', ');

  const canonicalHref = $('link[rel="canonical" i]').attr('href');
  let canonical: string | null = null;
  if (canonicalHref) {
    try {
      canonical = new URL(canonicalHref, pageUrl).toString();
    } catch {
      canonical = canonicalHref;
    }
  }

  const internal = new Set<string>();
  $('a[href]').each((_, el) => {
    if (internal.size >= 40 || !base) return;
    try {
      const u = new URL($(el).attr('href') ?? '', base);
      const sameHost = u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '');
      if (sameHost && /^https?:$/.test(u.protocol) && !ASSET_RE.test(u.pathname) && !PRIVATE_RE.test(u.pathname)) internal.add(u.pathname);
    } catch {
      /* ignore malformed hrefs */
    }
  });

  const title = $('head > title').first().text().trim() || $('title').first().text().trim();
  const metaDescription = ($('meta[name="description" i]').attr('content') ?? '').trim();
  const h1 = $('h1').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, 10);
  const lang = ($('html').attr('lang') ?? '').trim() || null;
  const spaShell = ['#root', '#app', '#__next', '#__nuxt', '[ng-version]'].some((sel) => {
    const el = $(sel).first();
    return el.length > 0 && el.text().trim().length < 50;
  });

  $('script, style, noscript, template, svg, iframe, head').remove();
  const wordCount = countWords($('body').text() || $.root().text());

  return {
    title: title.slice(0, 300),
    metaDescription: metaDescription.slice(0, 500),
    h1,
    wordCount,
    schemaTypes: [...types].sort(),
    jsonLdBlocks,
    jsonLdErrors,
    ogTags,
    canonical,
    lang,
    robotsMeta,
    noindex: /\b(noindex|none)\b/.test(robotsMeta),
    nosnippet: /\bnosnippet\b|max-snippet\s*:\s*0\b/.test(robotsMeta),
    noai: /\bnoai\b/.test(robotsMeta),
    spaShell,
    internalPaths: [...internal],
  };
}
