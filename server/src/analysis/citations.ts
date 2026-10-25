// Citation extraction: engine-provided sources + markdown links / bare URLs in the answer,
// normalized (lowercase host, no www., no utm_*), deduped by URL and classified own / competitor / third_party.
import type { Project, SourceType } from '../../../shared/types.ts';
import type { EngineCitation } from '../engines/types.ts';

export interface ResolvedCitation {
  url: string;
  domain: string;
  title: string;
  position: number;
  sourceType: SourceType;
  competitorId: string | null;
}

/** "https://www.Acme.com/x" | "www.acme.com" | "acme.com" → "acme.com". */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    return new URL(s).hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return input.trim().toLowerCase().replace(/^www\./, '').split(/[/?#]/)[0] ?? '';
  }
}

function cleanUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    return u;
  } catch {
    return null;
  }
}

/** Dedupe key: host without www, path without trailing slash, remaining query. */
const dedupeKey = (u: URL) => `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`;

const domainMatches = (domain: string, target: string) => !!target && (domain === target || domain.endsWith(`.${target}`));

/**
 * Aliases that look like a URL prefix ("github.com/acme", "npmjs.com/package/acme-cli") mark pages the entity owns on
 * someone else's domain (its repo, package, marketplace listing), lowercased without scheme and www.
 */
const urlPrefixes = (aliases: string[]) =>
  aliases.map((a) => a.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''))
    .filter((a) => /^[a-z0-9.-]+\.[a-z]{2,}\/\S+/.test(a));
const underPrefix = (hostPath: string, prefixes: string[]) => prefixes.some((p) => hostPath === p || hostPath.startsWith(`${p}/`));

/** Own / competitor / third-party by domain, or by URL prefix aliases when the full URL is known. */
export function classifySource(domain: string, project: Project, url?: string): { sourceType: SourceType; competitorId: string | null } {
  let hostPath = '';
  if (url) {
    try {
      const u = new URL(url);
      hostPath = `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      // keep domain-only matching
    }
  }
  if (domainMatches(domain, normalizeDomain(project.domain)) || (hostPath && underPrefix(hostPath, urlPrefixes(project.aliases)))) {
    return { sourceType: 'own', competitorId: null };
  }
  const comp = project.competitors.find((c) =>
    domainMatches(domain, normalizeDomain(c.domain)) || (hostPath && underPrefix(hostPath, urlPrefixes(c.aliases))));
  return comp ? { sourceType: 'competitor', competitorId: comp.id } : { sourceType: 'third_party', competitorId: null };
}

function linksInText(text: string): EngineCitation[] {
  const out: EngineCitation[] = [];
  for (const m of text.matchAll(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g)) out.push({ url: m[2]!, title: m[1]!.trim() });
  const withoutLinks = text.replace(/\]\((https?:\/\/[^\s)]+)\)/g, ']');
  for (const m of withoutLinks.matchAll(/https?:\/\/[^\s<>()[\]"'`]+/g)) out.push({ url: m[0].replace(/[.,;:!?]+$/, ''), title: '' });
  return out;
}

export function extractCitations(text: string, engineCitations: EngineCitation[], project: Project): ResolvedCitation[] {
  const out: ResolvedCitation[] = [];
  const seen = new Map<string, ResolvedCitation>();
  for (const c of [...engineCitations, ...linksInText(text)]) {
    const u = cleanUrl(c.url);
    if (!u) continue;
    const key = dedupeKey(u);
    const title = c.title && !/^https?:\/\//.test(c.title) ? c.title : '';
    const existing = seen.get(key);
    if (existing) {
      if (!existing.title || existing.title === existing.domain) existing.title = title || existing.title;
      continue;
    }
    const domain = normalizeDomain(u.hostname);
    const cit: ResolvedCitation = { url: u.toString(), domain, title: title || domain, position: out.length + 1, ...classifySource(domain, project, u.toString()) };
    seen.set(key, cit);
    out.push(cit);
  }
  return out;
}
