// Tracked-entity detection in AI answers (brand + competitors).
// Matching is case-insensitive and word-boundary aware on a markdown-stripped copy of the text:
// "Acme's" / "Acme." / "**Acme**" / "[Acme](https://…)" match, "Acmeville" does not.
import type { Project } from '../../../shared/types.ts';

export interface TrackedEntity {
  /** 'brand' or the competitor id (matches SeriesPoint keys). */
  key: string;
  type: 'brand' | 'competitor';
  competitorId: string | null;
  name: string;
  domain: string;
  terms: string[];
}

export interface DetectedMention {
  entity: TrackedEntity;
  /** 1-based order of first appearance among tracked entities. */
  position: number;
  count: number;
  /** Sentence / list item around the first mention (≤ 240 chars). */
  context: string;
  /** Text spans that talk about this entity (used for sentiment). */
  scopes: string[];
}

const CONTEXT_MAX = 240;

export function trackedEntities(project: Project): TrackedEntity[] {
  const terms = (name: string, aliases: string[], domain: string) =>
    [...new Set([name, ...aliases, domain].map((t) => t.trim()).filter((t) => t.length >= 2))];
  return [
    { key: 'brand', type: 'brand', competitorId: null, name: project.name, domain: project.domain, terms: terms(project.name, project.aliases, project.domain) },
    ...project.competitors.map((c) => ({
      key: c.id, type: 'competitor' as const, competitorId: c.id, name: c.name, domain: c.domain, terms: terms(c.name, c.aliases, c.domain),
    })),
  ];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function entityRegex(terms: string[]): RegExp {
  // Longest first so "Acme Cloud" wins over "Acme" inside the same alternation.
  const alt = [...terms].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt})(?![\\p{L}\\p{N}_])`, 'giu');
}

const DOMAIN_LIKE = /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/i;

/**
 * Markdown → plain text for matching: links keep their label, while domain-labelled links and bare URLs are
 * citations rather than mentions and are dropped; emphasis and [n] citation markers drop too.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string) => (DOMAIN_LIKE.test(label.trim()) ? '' : label.trim()))
    .replace(/<?(https?:\/\/[^\s<>()[\]"'`]+)>?/g, (_m, url: string) => /[.,;:!?]+$/.exec(url)?.[0] ?? '')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\d+(?:[,\s]*\d+)*\]/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/\*\*|__|~~|[*`]/g, '');
}

interface Segment { start: number; end: number }

const LIST_ITEM = /^\s*(?:[-•]|\d+[.)])\s+/;

/** Lines; prose lines are split into sentences, list items stay whole (pros/cons follow the name). */
function segmentsOf(text: string): Segment[] {
  const out: Segment[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    if (line.trim()) {
      if (LIST_ITEM.test(line)) out.push({ start: offset, end: offset + line.length });
      else {
        const re = /[.!?](?=\s+["“(\p{Lu}\p{N}])/gu;
        let s = 0;
        for (let m = re.exec(line); m; m = re.exec(line)) {
          out.push({ start: offset + s, end: offset + m.index + 1 });
          s = m.index + 1;
        }
        out.push({ start: offset + s, end: offset + line.length });
      }
    }
    offset += line.length + 1;
  }
  return out;
}

function contextAround(text: string, seg: Segment, hitStart: number): string {
  const raw = text.slice(seg.start, seg.end);
  const lead = raw.length - raw.replace(LIST_ITEM, '').trimStart().length;
  let s = raw.slice(lead).trim().replace(/\s+/g, ' ');
  if (s.length <= CONTEXT_MAX) return s;
  const rel = Math.max(0, hitStart - seg.start - lead - 80);
  s = s.slice(rel, rel + CONTEXT_MAX - 2).trim();
  return `${rel > 0 ? '…' : ''}${s}…`;
}

interface Hit { start: number; end: number; entity: number }

/** Finds tracked entities in an answer (markdown allowed). Results are ordered by position. */
export function detectMentions(markdown: string, entities: TrackedEntity[]): DetectedMention[] {
  const text = plainText(markdown);
  const raw: Hit[] = [];
  entities.forEach((e, i) => {
    if (!e.terms.length) return;
    for (const m of text.matchAll(entityRegex(e.terms))) raw.push({ start: m.index, end: m.index + m[0].length, entity: i });
  });
  // Resolve overlaps (e.g. "Acme" inside competitor "Acme Cloud"): earliest, then longest wins.
  raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const hits: Hit[] = [];
  for (const h of raw) if (!hits.length || h.start >= hits[hits.length - 1]!.end) hits.push(h);
  if (!hits.length) return [];

  const segments = segmentsOf(text);
  const segOf = (pos: number) => segments.find((s) => pos >= s.start && pos < s.end) ?? { start: pos, end: Math.min(text.length, pos + CONTEXT_MAX) };

  const byEntity = new Map<number, Hit[]>();
  for (const h of hits) byEntity.set(h.entity, [...(byEntity.get(h.entity) ?? []), h]);
  const order = [...byEntity.keys()].sort((a, b) => byEntity.get(a)![0]!.start - byEntity.get(b)![0]!.start);

  return order.map((ei, idx) => {
    const own = byEntity.get(ei)!;
    const first = own[0]!;
    // Sentiment scope per segment: from this entity's first hit (or segment start if it leads) to the next other-entity hit.
    const scopes: string[] = [];
    const seen = new Set<Segment>();
    for (const h of own) {
      const seg = segOf(h.start);
      if (seen.has(seg)) continue;
      seen.add(seg);
      const inSeg = hits.filter((x) => x.start >= seg.start && x.start < seg.end);
      const leads = inSeg[0]?.entity === ei;
      const next = inSeg.find((x) => x.start > h.start && x.entity !== ei);
      scopes.push(text.slice(leads ? seg.start : h.start, next ? next.start : seg.end).trim());
    }
    return {
      entity: entities[ei]!,
      position: idx + 1,
      count: own.length,
      context: contextAround(text, segOf(first.start), first.start),
      scopes,
    };
  });
}
