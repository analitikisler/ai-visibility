// Diagnose: five driver scores (0..100) for the brand and each competitor, traced to answers, mentions and citations.
// Reads the raw tables directly (no dependency on monitor aggregates) over the last `days` days.
import { all, daysAgo, get } from '../db/index.ts';
import { sourceDomainsFor } from '../data/sources.ts';
import { ensureAudit } from '../audit/index.ts';
import { AI_CATEGORIES } from '../crawlers/catalog.ts';
import type { AuditResult, Diagnosis, DriverId, DriverScore, EngineId, Project, PromptIntent, PromptTier } from '../../../shared/types.ts';

export interface PromptRow { id: string; text: string; topic: string; tier: PromptTier; intent: PromptIntent }
export interface ResponseRow { id: string; promptId: string; engine: EngineId; day: string }
export interface MentionRow { responseId: string; key: string; name: string; position: number; count: number; sentiment: number; label: string; context: string }
export interface CitationRow { responseId: string; domain: string; url: string; title: string; sourceType: string; competitorId: string | null }
export interface Entity { key: string; name: string; isBrand: boolean; domain: string; aliases: string[] }

export interface InsightData {
  project: Project;
  days: number;
  from: string;
  prompts: Map<string, PromptRow>;
  responses: ResponseRow[];
  mentions: Map<string, MentionRow[]>;    // by response id
  citations: Map<string, CitationRow[]>;  // by response id
  entities: Entity[];                     // brand first
  domainWeight: (domain: string) => number; // 0..1 authority of a third-party domain
}

export const ENGINE_NAMES: Record<EngineId, string> = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity', grok: 'Grok', deepseek: 'DeepSeek' };

export const DRIVER_NAMES: Record<DriverId, string> = {
  content_coverage: 'Content coverage',
  content_quality: 'Content quality & prominence',
  source_authority: 'Source authority',
  technical_readiness: 'Technical readiness',
  sentiment: 'Sentiment',
};
const DRIVER_WEIGHTS: Record<DriverId, number> = { content_coverage: 0.3, content_quality: 0.2, source_authority: 0.2, technical_readiness: 0.15, sentiment: 0.15 };
const DRIVERS = Object.keys(DRIVER_NAMES) as DriverId[];
/** A prompt counts as "covered" when the entity appears in at least this share of its answers. */
export const COVERED_MIN = 0.2;
const HIGH_AUTHORITY = 0.6;
const LOST_BRAND_MAX = 0.15;
const LOST_WINNER_MIN = 0.4;
const TIER_RANK: Record<PromptTier, number> = { must_win: 0, core: 1, foundational: 2 };

/** Case-insensitive whole-word matcher for an entity's name and aliases (used to spot entities named in a prompt). */
export function nameMatcher(e: Pick<Entity, 'name' | 'aliases'>): RegExp | null {
  const names = [e.name, ...e.aliases].map((n) => n.trim()).filter((n) => n.length >= 2);
  if (!names.length) return null;
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'iu');
}

// ---------- copy formatting (brand/retired/overt/BRAND.md §4 "Writing metrics"; mirrors web/src/lib/format.ts) ----------

export const MINUS = '\u2212';
/** Percent from a 0..1 ratio: no decimal at ≥10%, one decimal below (`38%`, `7.9%`, `0%`), like the Sources page. */
export function pct(x: number): string {
  const p = x * 100;
  if (p === 0 || !Number.isFinite(p)) return '0%';
  const abs = Math.abs(p);
  const body = Math.round(abs * 10) / 10 >= 10 ? String(Math.round(abs)) : abs < 0.1 ? '<0.1' : abs.toFixed(1);
  return `${p < 0 ? MINUS : ''}${body}%`;
}
/** Grouped integer (`2,880`). */
export const num = (n: number) => Math.round(n).toLocaleString('en-US');
/** `1 prompt` / `3 prompts` (count grouped). */
export const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
/** Signed with a true minus: `+5`, `−3` (no sign for 0). */
export const signed = (n: number, body: string = num(Math.abs(n))) => (n > 0 ? `+${body}` : n < 0 ? `${MINUS}${body}` : body);
/** `Oct 16` from an ISO timestamp or day. */
export const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const normDomain = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// ---------- data loading ----------

export function loadInsightData(project: Project, days = 30): InsightData {
  const from = daysAgo(days - 1);
  const prompts = new Map(
    all<PromptRow>('SELECT id, text, topic, tier, intent FROM prompts WHERE project_id = ? AND active = 1', [project.id]).map((p) => [p.id, p]),
  );
  const responses = all<ResponseRow>(
    `SELECT r.id, r.prompt_id promptId, r.engine, r.day FROM responses r JOIN prompts p ON p.id = r.prompt_id AND p.active = 1
     WHERE r.project_id = ? AND r.day >= ? AND r.error IS NULL`,
    [project.id, from],
  );
  const mentions = new Map<string, MentionRow[]>();
  for (const m of all<MentionRow & { entityType: string; competitorId: string | null }>(
    `SELECT response_id responseId, entity_type entityType, competitor_id competitorId, entity_name name, position, count, sentiment,
            sentiment_label label, context FROM mentions WHERE project_id = ? AND day >= ?`,
    [project.id, from],
  )) {
    const row: MentionRow = { ...m, key: m.entityType === 'brand' ? 'brand' : (m.competitorId ?? m.name) };
    const list = mentions.get(m.responseId);
    if (list) list.push(row);
    else mentions.set(m.responseId, [row]);
  }
  const citations = new Map<string, CitationRow[]>();
  for (const c of all<CitationRow>(
    `SELECT response_id responseId, domain, url, title, source_type sourceType, competitor_id competitorId
     FROM citations WHERE project_id = ? AND day >= ?`,
    [project.id, from],
  )) {
    const list = citations.get(c.responseId);
    if (list) list.push(c);
    else citations.set(c.responseId, [c]);
  }

  // Authority: Research's industry weights when known, else citation-frequency percentile among third-party domains.
  const catalog = sourceDomainsFor(project.industry);
  const maxW = Math.max(1e-9, ...catalog.map((s) => s.weight));
  const catalogW = new Map(catalog.map((s) => [normDomain(s.domain), s.weight / maxW]));
  const freq = new Map<string, number>();
  for (const list of citations.values()) for (const c of list) if (c.sourceType === 'third_party') freq.set(c.domain, (freq.get(c.domain) ?? 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
  const rankW = new Map(ranked.map((d, i) => [d, ranked.length > 1 ? 1 - i / (ranked.length - 1) : 1]));
  const domainWeight = (d: string) => catalogW.get(normDomain(d)) ?? rankW.get(d) ?? 0;

  const entities: Entity[] = [
    { key: 'brand', name: project.name, isBrand: true, domain: normDomain(project.domain), aliases: project.aliases },
    ...project.competitors.map((c) => ({ key: c.id, name: c.name, isBrand: false, domain: normDomain(c.domain), aliases: c.aliases })),
  ];
  return { project, days, from, prompts, responses, mentions, citations, entities, domainWeight };
}

// ---------- per-entity statistics ----------

export interface EntityStats {
  entity: Entity;
  responses: number;
  mentioned: number;
  visibility: number;
  mentionedIds: Set<string>;
  promptVis: Map<string, { n: number; m: number }>;
  rows: MentionRow[];
}

export function entityStats(data: InsightData, entity: Entity, responses: ResponseRow[] = data.responses): EntityStats {
  const promptVis = new Map<string, { n: number; m: number }>();
  const mentionedIds = new Set<string>();
  const rows: MentionRow[] = [];
  for (const r of responses) {
    const pv = promptVis.get(r.promptId) ?? { n: 0, m: 0 };
    pv.n++;
    const mine = (data.mentions.get(r.id) ?? []).filter((m) => m.key === entity.key);
    if (mine.length) {
      pv.m++;
      mentionedIds.add(r.id);
      rows.push(mine.reduce((a, b) => (a.position <= b.position ? a : b)));
    }
    promptVis.set(r.promptId, pv);
  }
  return { entity, responses: responses.length, mentioned: mentionedIds.size, visibility: responses.length ? mentionedIds.size / responses.length : 0, mentionedIds, promptVis, rows };
}

interface Coverage { score: number; prompts: number; covered: number; topics: string[]; topicsCovered: string[]; intents: number; intentsCovered: number; anyPrompts: number }
function coverage(data: InsightData, s: EntityStats): Coverage {
  const live = [...s.promptVis.entries()].filter(([, v]) => v.n > 0);
  const coveredIds = new Set(live.filter(([, v]) => v.m / v.n >= COVERED_MIN).map(([id]) => id));
  const topicOf = (id: string) => data.prompts.get(id)?.topic || 'General';
  const intentOf = (id: string) => data.prompts.get(id)?.intent ?? 'discovery';
  const topics = [...new Set(live.map(([id]) => topicOf(id)))];
  const topicsCovered = [...new Set([...coveredIds].map(topicOf))];
  const intents = new Set(live.map(([id]) => intentOf(id)));
  const intentsCovered = new Set([...coveredIds].map(intentOf));
  const f = (a: number, b: number) => (b ? a / b : 0);
  return {
    score: clamp(100 * (0.6 * f(coveredIds.size, live.length) + 0.25 * f(topicsCovered.length, topics.length) + 0.15 * f(intentsCovered.size, intents.size))),
    prompts: live.length, covered: coveredIds.size, topics, topicsCovered, intents: intents.size, intentsCovered: intentsCovered.size,
    anyPrompts: live.filter(([, v]) => v.m > 0).length,
  };
}

interface Quality { score: number; avgPosition: number | null; firstRate: number; firstCount: number; avgCount: number }
function quality(s: EntityStats): Quality {
  if (!s.rows.length) return { score: 0, avgPosition: null, firstRate: 0, firstCount: 0, avgCount: 0 };
  const posScore = avg(s.rows.map((r) => Math.max(0, 1 - (r.position - 1) * 0.25)));
  const firstCount = s.rows.filter((r) => r.position === 1).length;
  const avgCount = avg(s.rows.map((r) => r.count));
  const firstRate = firstCount / s.rows.length;
  return { score: clamp(100 * (0.45 * posScore + 0.3 * firstRate + 0.25 * Math.min(1, avgCount / 3))), avgPosition: avg(s.rows.map((r) => r.position)), firstRate, firstCount, avgCount };
}

interface Authority { score: number; citations: number; highShare: number; ownResponses: number; ownRate: number }
function authority(data: InsightData, s: EntityStats): Authority {
  let total = 0;
  let high = 0;
  let ownResponses = 0;
  for (const rid of s.mentionedIds) {
    let own = false;
    for (const c of data.citations.get(rid) ?? []) {
      total++;
      if (c.sourceType === 'third_party' && data.domainWeight(c.domain) >= HIGH_AUTHORITY) high++;
      if (s.entity.isBrand ? c.sourceType === 'own' : c.competitorId === s.entity.key || (!!s.entity.domain && normDomain(c.domain) === s.entity.domain)) own = true;
    }
    if (own) ownResponses++;
  }
  const highShare = total ? high / total : 0;
  const ownRate = s.mentioned ? ownResponses / s.mentioned : 0;
  return { score: clamp(100 * (0.6 * Math.min(1, highShare / 0.7) + 0.4 * Math.min(1, ownRate / 0.5))), citations: total, highShare, ownResponses, ownRate };
}

interface Sentiment { score: number; avg: number | null; negative: number; mentions: number }
function sentiment(s: EntityStats): Sentiment {
  if (!s.rows.length) return { score: s.responses ? 50 : 0, avg: null, negative: 0, mentions: 0 };
  const a = avg(s.rows.map((r) => r.sentiment));
  return { score: clamp((a + 1) * 50), avg: a, negative: s.rows.filter((r) => r.label === 'negative' || r.sentiment <= -0.25).length, mentions: s.rows.length };
}

// ---------- technical readiness (brand only) ----------

export interface TechFacts {
  score: number; audit: AuditResult | null; blocked: string[]; searchAgents: number; aiVisits: number; searchVisits: number; tracking: boolean;
  /** robots.txt couldn't be evaluated in the latest audit (site or robots.txt unreachable). */
  robotsUnknown: boolean;
}
function technical(project: Project, days: number): TechFacts {
  const audit = ensureAudit(project);
  const robotsUnknown = audit?.checks.find((c) => c.id === 'robots_ai_search')?.status === 'info';
  const search = robotsUnknown ? [] : (audit?.robots.agents ?? []).filter((a) => a.category === 'search' || a.category === 'user_fetch');
  const blocked = search.filter((a) => a.allowed === 'blocked').map((a) => a.agentName);
  const partial = search.filter((a) => a.allowed === 'partial').length;
  // Unverifiable access counts as none: if the audit couldn't read the site, neither can crawlers.
  const access = robotsUnknown ? 0 : search.length ? 1 - (blocked.length + partial * 0.5) / search.length : 1;
  const from = daysAgo(days - 1);
  const v = get<{ ai: number; search: number }>(
    `SELECT SUM(category IN (${AI_CATEGORIES.map(() => '?').join(',')})) ai, SUM(category IN ('search','user_fetch')) search
     FROM bot_events WHERE project_id = ? AND day >= ?`,
    [...AI_CATEGORIES, project.id, from],
  );
  const tracking = !!get('SELECT 1 FROM bot_events WHERE project_id = ? LIMIT 1', [project.id]);
  const aiVisits = v?.ai ?? 0;
  const activity = aiVisits > 0 ? 100 : tracking ? 0 : 50;
  const score = audit ? clamp(0.65 * audit.score + 25 * access + 0.1 * activity) : 50;
  return { score, audit, blocked, searchAgents: search.length, aiVisits, searchVisits: v?.search ?? 0, tracking, robotsUnknown };
}

// ---------- negative themes ----------

const THEMES: [string, RegExp][] = [
  ['pricing', /pric|expensive|cost|fee|billing|overpriced/i],
  ['support', /support|customer service|response time|helpdesk/i],
  ['reliability', /bug|crash|outage|downtime|unreliable|glitch|unstable/i],
  ['ease of use', /learning curve|complex|complicated|confusing|clunky|hard to use|steep|unintuitive/i],
  ['performance', /slow|lag|performance|sluggish/i],
  ['integrations', /integration|api|connector/i],
  ['missing features', /missing|lacks?|limited|no support for/i],
];

/** Most frequent complaint themes among negative mention contexts. */
export function negativeThemes(rows: MentionRow[]): { theme: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!(r.label === 'negative' || r.sentiment <= -0.25)) continue;
    for (const [theme, re] of THEMES) if (re.test(r.context)) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  return [...counts.entries()].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count);
}

// ---------- assembly ----------

interface EntityDrivers { stats: EntityStats; cov: Coverage; qual: Quality; auth: Authority; sent: Sentiment; scores: Record<DriverId, number> }

function entityDrivers(data: InsightData, entity: Entity, tech: number | null, responses?: ResponseRow[]): EntityDrivers {
  const stats = entityStats(data, entity, responses);
  const cov = coverage(data, stats);
  const qual = quality(stats);
  const auth = authority(data, stats);
  const sent = sentiment(stats);
  return {
    stats, cov, qual, auth, sent,
    scores: { content_coverage: cov.score, content_quality: qual.score, source_authority: auth.score, technical_readiness: tech ?? 50, sentiment: sent.score },
  };
}

export interface DiagnosisContext {
  diagnosis: Diagnosis;
  data: InsightData;
  brand: EntityDrivers;
  competitors: EntityDrivers[];
  tech: TechFacts;
}

export function computeDiagnosis(project: Project, days = 30): DiagnosisContext {
  const data = loadInsightData(project, days);
  const tech = technical(project, days);
  const brand = entityDrivers(data, data.entities[0]!, tech.score);
  const competitors = data.entities.slice(1).map((e) => entityDrivers(data, e, null));
  const B = project.name;
  const noData = data.responses.length === 0;

  const leaderOf = (id: DriverId) => {
    const best = competitors.reduce<EntityDrivers | null>((m, c) => (!m || c.scores[id] > m.scores[id] ? c : m), null);
    return best ? { score: best.scores[id], name: best.stats.entity.name, d: best } : null;
  };

  const drivers: DriverScore[] = DRIVERS.map((id) => {
    const lead = leaderOf(id);
    const base = { id, name: DRIVER_NAMES[id], score: brand.scores[id], leaderScore: lead?.score ?? 0, leaderName: lead?.name ?? 'No competitors tracked' };
    if (id === 'technical_readiness') {
      const a = tech.audit;
      const failing = a?.checks.filter((c) => c.status === 'fail') ?? [];
      return {
        ...base,
        leaderScore: 50,
        leaderName: 'Benchmark',
        explanation: a
          ? `Based on the latest AI-readiness audit (${a.score}/100) and whether AI crawlers can reach and actually fetch the site. Competitors' sites aren't measured, so 50 is shown as a neutral benchmark.`
          : `No AI-readiness audit yet, so this is a neutral 50 — run an audit to measure robots.txt, llms.txt, schema and server-rendered content. Competitors aren't measured (benchmark 50).`,
        evidence: [
          a ? `AI-readiness audit score ${a.score}/100${failing.length ? ` — ${plural(failing.length, 'failing check')}: ${failing.slice(0, 4).map((c) => c.title).join(', ')}` : ''}` : 'No audit has been run for this site yet',
          tech.robotsUnknown
            ? "robots.txt rules for AI agents couldn't be checked — the site didn't respond during the last audit"
            : tech.searchAgents
              ? tech.blocked.length
                ? `${num(tech.blocked.length)} of ${plural(tech.searchAgents, 'AI search & user-fetch agent')} blocked in robots.txt (${tech.blocked.slice(0, 4).join(', ')})`
                : `All ${plural(tech.searchAgents, 'AI search & user-fetch agent')} may crawl the site`
              : 'robots.txt rules for AI agents not evaluated yet',
          tech.tracking
            ? `AI crawlers made ${plural(tech.aiVisits, 'visit')} in the last ${days} days (${num(tech.searchVisits)} from AI search & user fetchers)`
            : 'No crawler data yet — install the crawler integration to see which AI agents read the site',
        ],
      };
    }
    if (noData) {
      return { ...base, explanation: `No AI answers were collected in the last ${days} days, so this driver can't be measured yet.`, evidence: ['Run monitoring on your prompts to collect answers'] };
    }
    const L = lead?.d;
    const Ln = lead?.name ?? '';
    if (id === 'content_coverage') {
      const c = brand.cov;
      const missing = c.topics.filter((t) => !c.topicsCovered.includes(t));
      const intentVis = new Map<string, { n: number; m: number }>();
      for (const [pid, v] of brand.stats.promptVis) {
        const it = data.prompts.get(pid)?.intent ?? 'discovery';
        const cur = intentVis.get(it) ?? { n: 0, m: 0 };
        intentVis.set(it, { n: cur.n + v.n, m: cur.m + v.m });
      }
      const weakest = [...intentVis.entries()].map(([k, v]) => ({ k, vis: v.n ? v.m / v.n : 0 })).sort((a, b) => a.vis - b.vis)[0];
      return {
        ...base,
        explanation: `${B} shows up consistently (in ≥${pct(COVERED_MIN)} of answers) on ${num(c.covered)} of ${plural(c.prompts, 'tracked prompt')} and ${num(c.topicsCovered.length)} of ${plural(c.topics.length, 'topic')}.${L ? ` ${Ln} covers ${num(L.cov.covered)}.` : ''}`,
        evidence: [
          `Mentioned consistently in ${num(c.covered)} of ${plural(c.prompts, 'prompt')} (${pct(c.prompts ? c.covered / c.prompts : 0)})${L ? ` vs ${Ln} ${pct(L.cov.prompts ? L.cov.covered / L.cov.prompts : 0)}` : ''}`,
          `Visible in ${num(brand.stats.mentioned)} of ${plural(brand.stats.responses, 'answer')} (${pct(brand.stats.visibility)})${L ? ` vs ${Ln} ${pct(L.stats.visibility)}` : ''}`,
          `Covers ${num(c.topicsCovered.length)} of ${plural(c.topics.length, 'topic')}${missing.length ? ` — missing: ${missing.slice(0, 4).join(', ')}` : ''}`,
          ...(weakest ? [`Weakest intent: ${weakest.k.replace('_', '-')} prompts (${pct(weakest.vis)} visibility)`] : []),
        ],
      };
    }
    if (id === 'content_quality') {
      const q = brand.qual;
      return {
        ...base,
        explanation: q.avgPosition === null
          ? `${B} isn't mentioned in any answer, so there's no prominence to measure.`
          : `When mentioned, ${B} appears at position #${q.avgPosition.toFixed(1)} on average and is the first recommendation in ${pct(q.firstRate)} of those answers.`,
        evidence: [
          `Average position ${q.avgPosition != null ? `#${q.avgPosition.toFixed(1)}` : '—'}${L?.qual.avgPosition != null ? ` vs ${Ln} #${L.qual.avgPosition.toFixed(1)}` : ''}`,
          `First recommendation in ${num(q.firstCount)} of ${plural(brand.stats.mentioned, 'answer')} that mention ${B} (${pct(q.firstRate)})${L ? ` vs ${Ln} ${pct(L.qual.firstRate)}` : ''}`,
          `${q.avgCount.toFixed(1)} mentions per answer when present${L ? ` vs ${Ln} ${L.qual.avgCount.toFixed(1)}` : ''}`,
        ],
      };
    }
    if (id === 'source_authority') {
      const a = brand.auth;
      const gap = new Map<string, number>();
      if (L) {
        for (const rid of L.stats.mentionedIds) {
          if (brand.stats.mentionedIds.has(rid)) continue;
          for (const c of data.citations.get(rid) ?? []) if (c.sourceType === 'third_party') gap.set(c.domain, (gap.get(c.domain) ?? 0) + 1);
        }
      }
      const gapTop = [...gap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
      return {
        ...base,
        explanation: `In answers that mention ${B}, ${pct(a.highShare)} of citations are high-authority third-party sources and ${project.domain} itself is cited in ${pct(a.ownRate)} of them.`,
        evidence: [
          `${project.domain} cited in ${num(a.ownResponses)} of ${plural(brand.stats.mentioned, 'answer')} that mention ${B} (${pct(a.ownRate)})${L ? ` vs ${Ln}'s site ${pct(L.auth.ownRate)}` : ''}`,
          `High-authority sources are ${pct(a.highShare)} of ${plural(a.citations, 'citation')} in those answers${L ? ` vs ${pct(L.auth.highShare)} for ${Ln}` : ''}`,
          ...(gapTop.length ? [`Top sources in answers mentioning ${Ln} but not ${B}: ${gapTop.map(([d, n]) => `${d} (${num(n)})`).join(', ')}`] : []),
        ],
      };
    }
    // sentiment
    const s = brand.sent;
    const themes = negativeThemes(brand.stats.rows).slice(0, 3);
    const engineSent = [...new Set(data.responses.map((r) => r.engine))]
      .map((e) => ({ e, s: sentiment(entityStats(data, data.entities[0]!, data.responses.filter((r) => r.engine === e))) }))
      .filter((x) => x.s.mentions > 0)
      .sort((a, b) => b.s.score - a.s.score);
    return {
      ...base,
      explanation: s.avg === null
        ? `${B} isn't mentioned yet, so sentiment is neutral by default.`
        : `Sentiment ${s.score}/100; ${pct(s.mentions ? s.negative / s.mentions : 0)} of mentions are negative.`,
      evidence: [
        `Sentiment ${s.score}/100${L ? ` vs ${Ln} ${L.sent.score}/100` : ''}`,
        `${plural(s.negative, 'negative mention')} of ${num(s.mentions)} (${pct(s.mentions ? s.negative / s.mentions : 0)})${themes.length ? ` — mostly about ${themes.map((t) => t.theme).join(', ')}` : ''}`,
        ...(engineSent.length > 1 ? [`Most positive engine: ${ENGINE_NAMES[engineSent[0]!.e]} (${engineSent[0]!.s.score}/100); least positive: ${ENGINE_NAMES[engineSent[engineSent.length - 1]!.e]} (${engineSent[engineSent.length - 1]!.s.score}/100)`] : []),
      ],
    };
  });

  const engines = [...new Set(data.responses.map((r) => r.engine))].sort();
  const byEngine = engines.map((engine) => ({
    engine,
    drivers: entityDrivers(data, data.entities[0]!, tech.score, data.responses.filter((r) => r.engine === engine)).scores,
  }));

  // Lost prompt: brand ≤ 15% while a competitor ≥ 40%. A competitor named in the prompt itself ("X vs Y", "alternatives
  // to X") trivially appears in the answer, so it can't be the winner. Ranked must_win > core > foundational, then by gap.
  const matchers = new Map(competitors.map((c) => [c.stats.entity.key, nameMatcher(c.stats.entity)]));
  const lostPrompts: Diagnosis['lostPrompts'] = [];
  for (const [pid, v] of brand.stats.promptVis) {
    if (v.n < 2) continue;
    const brandVis = v.m / v.n;
    if (brandVis > LOST_BRAND_MAX) continue;
    const text = data.prompts.get(pid)?.text ?? '';
    let best: { id: string; name: string; vis: number } | null = null;
    for (const c of competitors) {
      if (matchers.get(c.stats.entity.key)?.test(text)) continue;
      const cv = c.stats.promptVis.get(pid);
      const vis = cv && cv.n ? cv.m / cv.n : 0;
      if (!best || vis > best.vis) best = { id: c.stats.entity.key, name: c.stats.entity.name, vis };
    }
    if (best && best.vis >= LOST_WINNER_MIN) {
      lostPrompts.push({ promptId: pid, text, winner: best.name, winnerId: best.id, winnerVisibility: best.vis, brandVisibility: brandVis });
    }
  }
  const tierOf = (pid: string) => TIER_RANK[data.prompts.get(pid)?.tier ?? 'core'];
  lostPrompts.sort((a, b) => tierOf(a.promptId) - tierOf(b.promptId) || b.winnerVisibility - b.brandVisibility - (a.winnerVisibility - a.brandVisibility));

  const overall = clamp(DRIVERS.reduce((s, id) => s + DRIVER_WEIGHTS[id] * brand.scores[id], 0));
  return { diagnosis: { overall, drivers, byEngine, lostPrompts: lostPrompts.slice(0, 20) }, data, brand, competitors, tech };
}

export function getDiagnosis(project: Project, days = 30): Diagnosis {
  return computeDiagnosis(project, days).diagnosis;
}
