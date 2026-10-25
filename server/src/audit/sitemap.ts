// XML sitemap fetching: <urlset> and <sitemapindex> (one level deep), gzip supported, bounded size/time.
import { gunzipSync } from 'node:zlib';
import { fetchText } from './http.ts';

const LOC_RE = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
/** Sitemaps are ≤ 50 MB by spec; real ones are far smaller. Applies to the download and to the gunzipped size. */
const MAX_SITEMAP_BYTES = 20 * 1024 * 1024;
const decodeXml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

async function fetchXml(url: string, timeoutMs: number): Promise<string | null> {
  const r = await fetchText(url, { timeoutMs, maxBytes: MAX_SITEMAP_BYTES, accept: 'application/xml,text/xml,*/*;q=0.8', raw: true });
  if (!r.ok || !r.rawBytes) return null;
  let buf = Buffer.from(r.rawBytes);
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      // .xml.gz files: cap the inflated size too (gzip bombs).
      buf = gunzipSync(buf, { maxOutputLength: MAX_SITEMAP_BYTES });
    } catch {
      return null;
    }
  }
  const text = buf.toString('utf8');
  return /<(urlset|sitemapindex)[\s>]/i.test(text) ? text : null;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(LOC_RE)].map((m) => decodeXml(m[1]!));
}

export interface SitemapFetch {
  reachableUrl: string | null;   // first sitemap that returned valid XML
  urls: string[];                // page URLs (deduped, capped)
}

/** Fetches up to 3 sitemaps (+5 children per index) and returns page URLs. Never throws. */
export async function fetchSitemapUrls(sitemaps: string[], opts: { maxUrls?: number; timeoutMs?: number } = {}): Promise<SitemapFetch> {
  const maxUrls = opts.maxUrls ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const urls = new Set<string>();
  let reachableUrl: string | null = null;
  const tops = await Promise.all(sitemaps.slice(0, 3).map(async (u) => ({ u, xml: await fetchXml(u, timeoutMs) })));
  for (const { u, xml } of tops) {
    if (!xml) continue;
    reachableUrl ??= u;
    if (/<sitemapindex[\s>]/i.test(xml)) {
      const children = await Promise.all(locs(xml).slice(0, 5).map((c) => fetchXml(c, timeoutMs)));
      for (const cx of children) if (cx) for (const l of locs(cx)) urls.add(l);
    } else {
      for (const l of locs(xml)) urls.add(l);
    }
    if (urls.size >= maxUrls) break;
  }
  return { reachableUrl, urls: [...urls].slice(0, maxUrls) };
}

// In-memory cache: audits warm it, crawler "missed pages" read it. Failures are cached briefly to avoid refetch storms.
const OK_TTL = 6 * 3600_000;
const FAIL_TTL = 30 * 60_000;
const cache = new Map<string, { at: number; data: SitemapFetch }>();
const cacheKey = (sitemaps: string[]) => sitemaps.slice(0, 3).join('|');

export function cacheSitemapUrls(sitemaps: string[], data: SitemapFetch): void {
  cache.set(cacheKey(sitemaps), { at: Date.now(), data });
}

export async function sitemapUrlsCached(sitemaps: string[]): Promise<SitemapFetch> {
  const key = cacheKey(sitemaps);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.data.reachableUrl ? OK_TTL : FAIL_TTL)) return hit.data;
  const data = await fetchSitemapUrls(sitemaps);
  cache.set(key, { at: Date.now(), data });
  return data;
}
