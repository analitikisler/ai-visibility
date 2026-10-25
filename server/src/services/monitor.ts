// Monitor aggregates (overview, prompt stats, sources) and response listings, computed with SQL aggregates over
// responses / mentions / citations. The report and diagnose call these signatures — keep them stable.
import type { SQLInputValue } from 'node:sqlite';
import { all, daysAgo, get } from '../db/index.ts';
import type {
  AiResponse, Citation, EngineId, EngineMode, EngineStat, EntityStat, Kpi, Mention, Overview, Paged, Project, PromptStat,
  PromptTier, SentimentLabel, SeriesPoint, SourcesView, SourceStat, SourceType,
} from '../../../shared/types.ts';
import { engineDef, engineMode } from '../engines/catalog.ts';
import { nameMatcher } from './diagnose.ts';
import { BRAND_COLOR, getProject, listPrompts } from './projects.ts';
import { latestRun } from './runs.ts';

export interface AggFilter { days: number; engine?: EngineId; tier?: PromptTier }

interface Window { from: string; to: string }

const TIERS: PromptTier[] = ['must_win', 'core', 'foundational'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

function windows(days: number): { cur: Window; prev: Window } {
  return { cur: { from: daysAgo(days - 1), to: daysAgo(0) }, prev: { from: daysAgo(2 * days - 1), to: daysAgo(days) } };
}

function dayList(w: Window): string[] {
  const out: string[] = [];
  for (let t = Date.parse(w.from); t <= Date.parse(w.to); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

type Alias = 'r' | 'm' | 'c';

/**
 * WHERE clause for a project, window and filter over `responses r`, `mentions m` or `citations c` — all three carry
 * denormalized project_id/day/engine/prompt_id, so aggregates never need a join. Errored responses are excluded from
 * metrics; they never have mentions or citations (an error always means an empty answer).
 */
function scope(projectId: string, w: Window, f: Partial<AggFilter>, a: Alias = 'r'): { sql: string; params: SQLInputValue[] } {
  const parts = [`${a}.project_id = ?`, `${a}.day BETWEEN ? AND ?`];
  const params: SQLInputValue[] = [projectId, w.from, w.to];
  if (a === 'r') parts.push('r.error IS NULL');
  if (f.engine) {
    parts.push(`${a}.engine = ?`);
    params.push(f.engine);
  }
  if (f.tier) {
    parts.push(`${a}.prompt_id IN (SELECT id FROM prompts WHERE project_id = ? AND tier = ?)`);
    params.push(projectId, f.tier);
  }
  return { sql: parts.join(' AND '), params };
}

const entityKey = (type: string, cid: string | null) => (type === 'brand' ? 'brand' : cid ?? '');

// ---------------------------------------------------------------- overview

interface PeriodStats {
  responses: number;
  brandResponses: number;
  entities: Map<string, { rows: number; pos: number | null; sent: number | null }>;
  totalRows: number;
  ownCitations: number;
}

function periodStats(projectId: string, w: Window, f: AggFilter): PeriodStats {
  const s = scope(projectId, w, f);
  const sm = scope(projectId, w, f, 'm');
  const sc = scope(projectId, w, f, 'c');
  const totals = get<{ n: number; b: number | null }>(`SELECT COUNT(*) n, SUM(r.brand_mentioned) b FROM responses r WHERE ${s.sql}`, s.params);
  const rows = all<{ t: string; cid: string | null; rows: number; pos: number | null; sent: number | null }>(
    `SELECT m.entity_type t, m.competitor_id cid, COUNT(*) rows, AVG(m.position) pos, AVG(m.sentiment) sent
     FROM mentions m WHERE ${sm.sql} GROUP BY m.entity_type, m.competitor_id`, sm.params);
  const own = get<{ n: number }>(`SELECT COUNT(*) n FROM citations c WHERE ${sc.sql} AND c.source_type = 'own'`, sc.params);
  const entities = new Map(rows.map((x) => [entityKey(x.t, x.cid), { rows: x.rows, pos: x.pos, sent: x.sent }]));
  return {
    responses: totals?.n ?? 0, brandResponses: totals?.b ?? 0, entities,
    totalRows: rows.reduce((a, x) => a + x.rows, 0), ownCitations: own?.n ?? 0,
  };
}

function kpi(cur: number, prev: number | null): Kpi {
  return { value: cur, delta: prev === null ? null : r2(cur - prev) };
}

/** Ratio → 0..100 score with 2 decimals, rounded exactly like the leaderboard's 4-decimal ratios (no double rounding). */
const score100 = (x: number) => Math.round(x * 10000) / 100;

function brandKpis(cur: PeriodStats, prev: PeriodStats): Overview['kpis'] {
  const hasPrev = prev.responses > 0;
  const vis = (p: PeriodStats) => score100(ratio(p.brandResponses, p.responses));
  const sov = (p: PeriodStats) => score100(ratio(p.entities.get('brand')?.rows ?? 0, p.totalRows));
  const pos = (p: PeriodStats) => p.entities.get('brand')?.pos ?? null;
  const sent = (p: PeriodStats) => {
    const s = p.entities.get('brand')?.sent;
    return s === null || s === undefined ? null : r2((s + 1) * 50);
  };
  const curPos = pos(cur);
  const prevPos = pos(prev);
  const curSent = sent(cur);
  const prevSent = sent(prev);
  return {
    visibilityScore: kpi(vis(cur), hasPrev ? vis(prev) : null),
    shareOfVoice: kpi(sov(cur), hasPrev ? sov(prev) : null),
    avgPosition: { value: curPos === null ? 0 : r2(curPos), delta: curPos !== null && prevPos !== null ? r2(curPos - prevPos) : null },
    // No brand mentions → no sentiment to report (never a fabricated neutral 50).
    sentiment: curSent === null ? { value: null, delta: null } : kpi(curSent, prevSent),
    mentions: kpi(cur.entities.get('brand')?.rows ?? 0, hasPrev ? (prev.entities.get('brand')?.rows ?? 0) : null),
    citations: kpi(cur.ownCitations, hasPrev ? prev.ownCitations : null),
  };
}

function leaderboard(project: Project, p: PeriodStats): EntityStat[] {
  const entities = [
    { key: 'brand', name: project.name, isBrand: true, color: BRAND_COLOR },
    ...project.competitors.map((c) => ({ key: c.id, name: c.name, isBrand: false, color: c.color })),
  ];
  return entities
    .map((e) => {
      const s = p.entities.get(e.key);
      return {
        ...e,
        visibility: r4(ratio(s?.rows ?? 0, p.responses)),
        shareOfVoice: r4(ratio(s?.rows ?? 0, p.totalRows)),
        avgPosition: s?.pos === null || s?.pos === undefined ? null : r2(s.pos),
        sentiment: s?.sent === null || s?.sent === undefined ? null : r2(s.sent),
        mentions: s?.rows ?? 0,
        rank: 0,
      };
    })
    .sort((a, b) => b.visibility - a.visibility || b.shareOfVoice - a.shareOfVoice || Number(b.isBrand) - Number(a.isBrand))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

function trends(project: Project, w: Window, f: AggFilter): { visibility: SeriesPoint[]; sov: SeriesPoint[] } {
  const s = scope(project.id, w, f);
  const perDay = new Map(all<{ day: string; n: number }>(`SELECT r.day, COUNT(*) n FROM responses r WHERE ${s.sql} GROUP BY r.day`, s.params).map((x) => [x.day, x.n]));
  const sm = scope(project.id, w, f, 'm');
  const rows = all<{ day: string; t: string; cid: string | null; rows: number }>(
    `SELECT m.day, m.entity_type t, m.competitor_id cid, COUNT(*) rows FROM mentions m
     WHERE ${sm.sql} GROUP BY m.day, m.entity_type, m.competitor_id`, sm.params);
  const byDay = new Map<string, Map<string, number>>();
  for (const x of rows) {
    const m = byDay.get(x.day) ?? new Map<string, number>();
    m.set(entityKey(x.t, x.cid), x.rows);
    byDay.set(x.day, m);
  }
  const keys = ['brand', ...project.competitors.map((c) => c.id)];
  const visibility: SeriesPoint[] = [];
  const sov: SeriesPoint[] = [];
  for (const day of dayList(w)) {
    const n = perDay.get(day) ?? 0;
    const m = byDay.get(day) ?? new Map<string, number>();
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const vp: SeriesPoint = { day };
    const sp: SeriesPoint = { day };
    for (const k of keys) {
      vp[k] = n ? r4(ratio(m.get(k) ?? 0, n)) : null;
      sp[k] = n ? r4(ratio(m.get(k) ?? 0, total)) : null;
    }
    visibility.push(vp);
    sov.push(sp);
  }
  return { visibility, sov };
}

function engineStats(project: Project, w: Window, f: AggFilter): EngineStat[] {
  const s = scope(project.id, w, f);
  const resp = all<{ engine: EngineId; n: number; b: number; pos: number | null; sent: number | null }>(
    `SELECT r.engine, COUNT(*) n, SUM(r.brand_mentioned) b, AVG(r.brand_position) pos, AVG(r.brand_sentiment) sent
     FROM responses r WHERE ${s.sql} GROUP BY r.engine`, s.params);
  const sm = scope(project.id, w, f, 'm');
  const sov = new Map(all<{ engine: string; b: number; t: number }>(
    `SELECT m.engine, SUM(m.entity_type = 'brand') b, COUNT(*) t FROM mentions m WHERE ${sm.sql} GROUP BY m.engine`, sm.params)
    .map((x) => [x.engine, ratio(x.b, x.t)]));
  const ids = [...new Set<EngineId>([...project.engines, ...resp.map((x) => x.engine)])].filter((e) => !f.engine || e === f.engine);
  return ids.map((engine) => {
    const x = resp.find((r) => r.engine === engine);
    let name: string = engine;
    let mode: EngineMode = 'simulated';
    try {
      name = engineDef(engine).name;
      mode = project.isDemo ? 'simulated' : engineMode(engine);
    } catch {
      // Unknown engine id in stored data: keep raw id.
    }
    return {
      engine, name, mode,
      responses: x?.n ?? 0,
      visibility: r4(ratio(x?.b ?? 0, x?.n ?? 0)),
      avgPosition: x?.pos == null ? null : r2(x.pos),
      sentiment: x?.sent == null ? null : r2(x.sent),
      shareOfVoice: r4(sov.get(engine) ?? 0),
    };
  });
}

function sentimentBreakdown(projectId: string, w: Window, f: AggFilter): Overview['sentimentBreakdown'] {
  const s = scope(projectId, w, f, 'm');
  const out = { positive: 0, neutral: 0, negative: 0 };
  for (const x of all<{ l: SentimentLabel; n: number }>(
    `SELECT m.sentiment_label l, COUNT(*) n FROM mentions m WHERE ${s.sql} AND m.entity_type = 'brand' GROUP BY m.sentiment_label`, s.params)) {
    if (x.l in out) out[x.l] = x.n;
  }
  return out;
}

/** Brand visibility per prompt tier (tier filter intentionally ignored: this is the tier breakdown). */
function tierStats(projectId: string, w: Window, f: AggFilter): Overview['tiers'] {
  const s = scope(projectId, w, { engine: f.engine });
  const vis = new Map(all<{ tier: string; n: number; b: number }>(
    `SELECT p.tier, COUNT(*) n, SUM(r.brand_mentioned) b FROM responses r JOIN prompts p ON p.id = r.prompt_id
     WHERE ${s.sql} GROUP BY p.tier`, s.params).map((x) => [x.tier, ratio(x.b, x.n)]));
  const counts = new Map(all<{ tier: string; n: number }>(
    'SELECT tier, COUNT(*) n FROM prompts WHERE project_id = ? AND active = 1 GROUP BY tier', [projectId]).map((x) => [x.tier, x.n]));
  return TIERS.map((tier) => ({ tier, prompts: counts.get(tier) ?? 0, visibility: r4(vis.get(tier) ?? 0) }));
}

export function getOverview(projectId: string, f: AggFilter): Overview {
  const project = getProject(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  const { cur, prev } = windows(f.days);
  const curStats = periodStats(projectId, cur, f);
  const prevStats = periodStats(projectId, prev, f);
  const t = trends(project, cur, f);
  const promptCount = get<{ n: number }>(
    `SELECT COUNT(*) n FROM prompts WHERE project_id = ? AND active = 1${f.tier ? ' AND tier = ?' : ''}`, f.tier ? [projectId, f.tier] : [projectId]);
  const runCount = get<{ n: number }>("SELECT COUNT(*) n FROM runs WHERE project_id = ? AND status = 'completed' AND day BETWEEN ? AND ?", [projectId, cur.from, cur.to]);
  return {
    range: { from: cur.from, to: cur.to, days: f.days },
    kpis: brandKpis(curStats, prevStats),
    visibilityTrend: t.visibility,
    sovTrend: t.sov,
    leaderboard: leaderboard(project, curStats),
    engines: engineStats(project, cur, f),
    topSources: getSources(projectId, f).sources.slice(0, 8),
    sentimentBreakdown: sentimentBreakdown(projectId, cur, f),
    tiers: tierStats(projectId, cur, f),
    lastRun: latestRun(projectId),
    totals: { responses: curStats.responses, prompts: promptCount?.n ?? 0, runs: runCount?.n ?? 0 },
  };
}

// ---------------------------------------------------------------- prompt stats

export function getPromptStats(projectId: string, f: AggFilter): PromptStat[] {
  const project = getProject(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  const { cur } = windows(f.days);
  const s = scope(projectId, cur, f);
  const perEngine = all<{ pid: string; engine: EngineId; n: number; b: number; ps: number | null; pc: number; ss: number | null; sc: number }>(
    `SELECT r.prompt_id pid, r.engine, COUNT(*) n, SUM(r.brand_mentioned) b, SUM(r.brand_position) ps, COUNT(r.brand_position) pc,
       SUM(r.brand_sentiment) ss, COUNT(r.brand_sentiment) sc
     FROM responses r WHERE ${s.sql} GROUP BY r.prompt_id, r.engine`, s.params);
  const sm = scope(projectId, cur, f, 'm');
  const comp = all<{ pid: string; cid: string; rows: number }>(
    `SELECT m.prompt_id pid, m.competitor_id cid, COUNT(*) rows FROM mentions m
     WHERE ${sm.sql} AND m.entity_type = 'competitor' GROUP BY m.prompt_id, m.competitor_id`, sm.params);
  const daily = all<{ pid: string; day: string; n: number; b: number }>(
    `SELECT r.prompt_id pid, r.day, COUNT(*) n, SUM(r.brand_mentioned) b FROM responses r WHERE ${s.sql}
     GROUP BY r.prompt_id, r.day ORDER BY r.day`, s.params);
  const lastAt = new Map(all<{ pid: string; t: string }>(
    'SELECT prompt_id pid, MAX(created_at) t FROM responses WHERE project_id = ? GROUP BY prompt_id', [projectId]).map((x) => [x.pid, x.t]));
  const names = new Map(project.competitors.map((c) => [c.id, c.name]));
  const matchers = new Map(project.competitors.map((c) => [c.id, nameMatcher(c)]));

  return listPrompts(projectId)
    .filter((p) => !f.tier || p.tier === f.tier)
    .map((prompt) => {
      const rows = perEngine.filter((x) => x.pid === prompt.id);
      const n = rows.reduce((a, x) => a + x.n, 0);
      const b = rows.reduce((a, x) => a + x.b, 0);
      const pc = rows.reduce((a, x) => a + x.pc, 0);
      const sc = rows.reduce((a, x) => a + x.sc, 0);
      const byEngine: PromptStat['byEngine'] = {};
      for (const x of rows) byEngine[x.engine] = { visibility: r4(ratio(x.b, x.n)), position: x.pc ? r2((x.ps ?? 0) / x.pc) : null, responses: x.n };
      const promptComp = comp.filter((x) => x.pid === prompt.id && names.has(x.cid));
      // A competitor named in the prompt ("alternatives to X", "X vs Y") trivially appears in the answer, so the top
      // competitor is the strongest one the prompt doesn't name (same rule as diagnose's lost prompts).
      const top = promptComp.filter((x) => !matchers.get(x.cid)?.test(prompt.text)).sort((a, z) => z.rows - a.rows)[0];
      const competitorVisibility = Object.fromEntries(promptComp.map((x) => [x.cid, r4(ratio(x.rows, n))]));
      return {
        prompt,
        responses: n,
        visibility: r4(ratio(b, n)),
        avgPosition: pc ? r2(rows.reduce((a, x) => a + (x.ps ?? 0), 0) / pc) : null,
        sentiment: sc ? r2(rows.reduce((a, x) => a + (x.ss ?? 0), 0) / sc) : null,
        byEngine,
        topCompetitor: top ? { name: names.get(top.cid)!, visibility: r4(ratio(top.rows, n)) } : null,
        competitorVisibility,
        trend: daily.filter((x) => x.pid === prompt.id).map((x) => r4(ratio(x.b, x.n))),
        lastRunAt: lastAt.get(prompt.id) ?? null,
      };
    });
}

// ---------------------------------------------------------------- sources

export function getSources(projectId: string, f: AggFilter): SourcesView {
  const { cur } = windows(f.days);
  const s = scope(projectId, cur, f, 'c');
  const from = `FROM citations c WHERE ${s.sql}`;
  const domains = all<{ domain: string; st: SourceType; cid: string | null; n: number; resp: number; prompts: number; engines: string }>(
    `SELECT c.domain, MAX(c.source_type) st, MAX(c.competitor_id) cid, COUNT(*) n, COUNT(DISTINCT c.response_id) resp,
       COUNT(DISTINCT c.prompt_id) prompts, GROUP_CONCAT(DISTINCT c.engine) engines
     ${from} GROUP BY c.domain ORDER BY n DESC, c.domain LIMIT 200`, s.params);
  // CROSS JOIN pins the join order: distinct (domain, response) pairs first, then a primary-key lookup per response.
  const brandRate = new Map(all<{ domain: string; rate: number }>(
    `SELECT d.domain, AVG(r.brand_mentioned) rate FROM (SELECT DISTINCT c.domain, c.response_id ${from}) d
     CROSS JOIN responses r ON r.id = d.response_id GROUP BY d.domain`, s.params).map((x) => [x.domain, x.rate]));
  const urls = new Map<string, { url: string; title: string; count: number }[]>();
  for (const u of all<{ domain: string; url: string; title: string; n: number }>(
    `SELECT c.domain, c.url, MAX(c.title) title, COUNT(*) n ${from} GROUP BY c.domain, c.url ORDER BY n DESC`, s.params)) {
    const list = urls.get(u.domain) ?? [];
    if (list.length < 3) list.push({ url: u.url, title: u.title, count: u.n });
    urls.set(u.domain, list);
  }
  const byType = { own: 0, competitor: 0, third_party: 0 };
  for (const x of all<{ st: SourceType; n: number }>(`SELECT c.source_type st, COUNT(*) n ${from} GROUP BY c.source_type`, s.params)) {
    if (x.st in byType) byType[x.st] = x.n;
  }
  const total = byType.own + byType.competitor + byType.third_party;
  const sources: SourceStat[] = domains.map((d) => ({
    domain: d.domain, sourceType: d.st, competitorId: d.cid, citations: d.n, share: r4(ratio(d.n, total)), responses: d.resp,
    prompts: d.prompts, engines: (d.engines ?? '').split(',').filter(Boolean) as EngineId[], brandMentionedRate: r4(brandRate.get(d.domain) ?? 0),
    sampleUrls: urls.get(d.domain) ?? [],
  }));
  return { sources, byType, totalCitations: total };
}

// ---------------------------------------------------------------- responses

interface ResponseRow {
  id: string; project_id: string; run_id: string; prompt_id: string; prompt_text: string | null; engine: EngineId; model: string; mode: EngineMode; text: string;
  brand_mentioned: number; brand_position: number | null; brand_sentiment: number | null; latency_ms: number | null; error: string | null; created_at: string;
  input_tokens: number | null; output_tokens: number | null; cached_tokens: number | null; search_calls: number | null; cost_usd: number | null; batch: number;
}

function hydrate(rows: ResponseRow[]): AiResponse[] {
  if (!rows.length) return [];
  // All rows belong to one project; the project_id prefix lets SQLite use the (project_id, day) indexes.
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const params = [rows[0]!.project_id, ...ids];
  const mentions = all<{ response_id: string; entity_type: Mention['entityType']; competitor_id: string | null; entity_name: string; position: number;
    count: number; sentiment: number; sentiment_label: SentimentLabel; context: string }>(
    `SELECT * FROM mentions WHERE project_id = ? AND response_id IN (${marks}) ORDER BY position`, params);
  const citations = all<{ response_id: string; url: string; domain: string; title: string; position: number; source_type: SourceType; competitor_id: string | null }>(
    `SELECT * FROM citations WHERE project_id = ? AND response_id IN (${marks}) ORDER BY position`, params);
  return rows.map((r) => ({
    id: r.id, runId: r.run_id, promptId: r.prompt_id, promptText: r.prompt_text ?? '', engine: r.engine, model: r.model, mode: r.mode, text: r.text,
    brandMentioned: r.brand_mentioned === 1, brandPosition: r.brand_position, brandSentiment: r.brand_sentiment,
    mentions: mentions.filter((m) => m.response_id === r.id).map((m): Mention => ({
      entityType: m.entity_type, competitorId: m.competitor_id, entityName: m.entity_name, position: m.position, count: m.count,
      sentiment: m.sentiment, sentimentLabel: m.sentiment_label, context: m.context,
    })),
    citations: citations.filter((c) => c.response_id === r.id).map((c): Citation => ({
      url: c.url, domain: c.domain, title: c.title, position: c.position, sourceType: c.source_type, competitorId: c.competitor_id,
    })),
    latencyMs: r.latency_ms, error: r.error, createdAt: r.created_at,
    usage: r.cost_usd === null ? null : {
      inputTokens: r.input_tokens ?? 0, outputTokens: r.output_tokens ?? 0, cachedTokens: r.cached_tokens ?? 0,
      searchCalls: r.search_calls ?? 0, costUsd: r.cost_usd, batch: r.batch === 1,
    },
  }));
}

const RESPONSE_SELECT = 'SELECT r.*, p.text prompt_text FROM responses r LEFT JOIN prompts p ON p.id = r.prompt_id';

export interface ResponseQuery {
  promptId?: string; engine?: EngineId; runId?: string; mentioned?: boolean;
  /** true → only failed answers (error set); false → only successful ones. `mentioned` implies successful. */
  failed?: boolean;
  days?: number; tier?: PromptTier; q?: string; citedDomain?: string; limit: number; offset: number;
}

export function listResponses(projectId: string, q: ResponseQuery): Paged<AiResponse> {
  const parts = ['r.project_id = ?'];
  const params: SQLInputValue[] = [projectId];
  const add = (sql: string, value: SQLInputValue | undefined) => {
    if (value === undefined) return;
    parts.push(sql);
    params.push(value);
  };
  add('r.prompt_id = ?', q.promptId);
  add('r.engine = ?', q.engine);
  add('r.run_id = ?', q.runId);
  add('r.brand_mentioned = ?', q.mentioned === undefined ? undefined : q.mentioned ? 1 : 0);
  // A failed answer (error set, empty text) is neither "named" nor "not named".
  if (q.failed === true) parts.push('r.error IS NOT NULL');
  else if (q.failed === false || q.mentioned !== undefined) parts.push('r.error IS NULL');
  add('r.day >= ?', q.days === undefined ? undefined : daysAgo(q.days - 1));
  add('p.tier = ?', q.tier);
  add('EXISTS (SELECT 1 FROM citations c WHERE c.response_id = r.id AND c.domain = ?)', q.citedDomain);
  add("(r.text LIKE '%' || ? || '%' OR p.text LIKE '%' || ? || '%')", q.q);
  if (q.q !== undefined) params.push(q.q);
  const where = parts.join(' AND ');
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM responses r LEFT JOIN prompts p ON p.id = r.prompt_id WHERE ${where}`, params)?.n ?? 0;
  const rows = all<ResponseRow>(`${RESPONSE_SELECT} WHERE ${where} ORDER BY r.created_at DESC, r.id LIMIT ? OFFSET ?`, [...params, q.limit, q.offset]);
  return { items: hydrate(rows), total, limit: q.limit, offset: q.offset };
}

export function getResponse(responseId: string): AiResponse | null {
  return hydrate(all<ResponseRow>(`${RESPONSE_SELECT} WHERE r.id = ?`, [responseId]))[0] ?? null;
}
