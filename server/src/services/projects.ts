// Projects, competitors and prompts: reads plus CRUD and setup suggestions.
import * as cheerio from 'cheerio';
import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { all, daysAgo, get, id, insert, nowIso, parseJson, run, tx } from '../db/index.ts';
import type {
  Competitor, EngineId, Project, ProjectInput, ProjectSuggestion, Prompt, PromptInput, PromptIntent, PromptTier, Schedule,
} from '../../../shared/types.ts';
import { normalizeDomain } from '../analysis/citations.ts';
import { reanalyzeProject } from '../analysis/persist.ts';
import { promptTemplatesFor } from '../data/prompt-templates.ts';
import { hasLlm, llmComplete } from '../lib/llm.ts';
import { safeFetch } from '../lib/safe-fetch.ts';

interface ProjectRow {
  id: string; name: string; domain: string; aliases_json: string; description: string; industry: string;
  market: string; language: string; engines_json: string; schedule: string; site_key: string; is_demo: number;
  created_at: string; updated_at: string;
}
interface CompetitorRow { id: string; project_id: string; name: string; domain: string; aliases_json: string; color: string }
interface PromptRow { id: string; project_id: string; text: string; topic: string; tier: string; intent: string; active: number; created_at: string }

/** Chart colors mirror brand/tokens.json (light values): chart-1 is the brand, competitors take chart-2… in order.
 *  The web maps these hexes to theme tokens (web/src/lib/colors.ts). */
export const BRAND_COLOR = '#1161bb';
const COMPETITOR_COLORS = ['#e5560f', '#cf4fb9', '#009068', '#8658e1', '#9f7100', '#0794b0', '#818c01', '#646d7e'];
export const DEFAULT_ENGINES: EngineId[] = ['chatgpt', 'claude', 'gemini', 'perplexity'];

export function toCompetitor(r: CompetitorRow): Competitor {
  return { id: r.id, projectId: r.project_id, name: r.name, domain: r.domain, aliases: parseJson(r.aliases_json, []), color: r.color };
}

export function listCompetitors(projectId: string): Competitor[] {
  return all<CompetitorRow>('SELECT * FROM competitors WHERE project_id = ? ORDER BY created_at, name', [projectId]).map(toCompetitor);
}

function toProject(r: ProjectRow): Project {
  const counts = get<{ n: number }>('SELECT COUNT(*) n FROM prompts WHERE project_id = ? AND active = 1', [r.id]);
  const last = get<{ t: string | null }>("SELECT MAX(started_at) t FROM runs WHERE project_id = ? AND status = 'completed'", [r.id]);
  return {
    id: r.id, name: r.name, domain: r.domain, aliases: parseJson(r.aliases_json, []), description: r.description,
    industry: r.industry, market: r.market, language: r.language, engines: parseJson<EngineId[]>(r.engines_json, []),
    schedule: r.schedule as Schedule, siteKey: r.site_key, isDemo: r.is_demo === 1, createdAt: r.created_at,
    updatedAt: r.updated_at, competitors: listCompetitors(r.id), promptCount: counts?.n ?? 0, lastRunAt: last?.t ?? null,
  };
}

export function getProject(id: string): Project | null {
  const row = get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
  return row ? toProject(row) : null;
}

export function getProjectBySiteKey(siteKey: string): Project | null {
  const row = get<ProjectRow>('SELECT * FROM projects WHERE site_key = ?', [siteKey]);
  return row ? toProject(row) : null;
}

export function listProjects(): Project[] {
  return all<ProjectRow>('SELECT * FROM projects ORDER BY is_demo, created_at DESC').map((r) => ({
    ...toProject(r),
    summary: projectSummary(r.id),
  }));
}

/** 30-day brand visibility score, delta vs the prior 30 days, and a daily 0..1 trend (null = no answers). */
function projectSummary(projectId: string, days = 30): NonNullable<Project['summary']> {
  const from = daysAgo(days - 1);
  const rows = all<{ day: string; v: number }>(
    'SELECT day, AVG(brand_mentioned) v FROM responses WHERE project_id = ? AND day >= ? AND error IS NULL GROUP BY day',
    [projectId, from],
  );
  const byDay = new Map(rows.map((r) => [r.day, r.v]));
  const trend = Array.from({ length: days }, (_, i) => byDay.get(daysAgo(days - 1 - i)) ?? null);
  const avg = (sql: string, args: SQLInputValue[]) => get<{ v: number | null }>(sql, args)?.v ?? null;
  const cur = avg('SELECT AVG(brand_mentioned) v FROM responses WHERE project_id = ? AND day >= ? AND error IS NULL', [projectId, from]);
  const prev = avg(
    'SELECT AVG(brand_mentioned) v FROM responses WHERE project_id = ? AND day >= ? AND day < ? AND error IS NULL',
    [projectId, daysAgo(2 * days - 1), from],
  );
  // 2 decimals, rounded like the overview KPI and leaderboard ratios so the UI's integer rounding agrees everywhere.
  const score = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 100);
  const value = score(cur);
  const prior = score(prev);
  return { visibilityScore: value, delta: value !== null && prior !== null ? Math.round((value - prior) * 100) / 100 : null, trend };
}

// ---------------------------------------------------------------- projects

const cleanList = (xs: string[] | undefined) => [...new Set((xs ?? []).map((s) => s.trim()).filter(Boolean))];

export function createProject(input: ProjectInput, opts: { isDemo?: boolean; createdAt?: string } = {}): Project {
  const pid = id('prj');
  const createdAt = opts.createdAt ?? nowIso();
  tx(() => {
    insert('projects', {
      id: pid, name: input.name.trim(), domain: normalizeDomain(input.domain), aliases_json: JSON.stringify(cleanList(input.aliases)),
      description: input.description?.trim() ?? '', industry: input.industry?.trim() ?? '', market: input.market ?? 'US',
      language: input.language ?? 'en', engines_json: JSON.stringify(input.engines?.length ? [...new Set(input.engines)] : DEFAULT_ENGINES),
      schedule: input.schedule ?? 'daily', site_key: id('sk', 20), ingest_token: newIngestToken(), is_demo: opts.isDemo ?? false, created_at: createdAt, updated_at: createdAt,
    });
    insertCompetitors(pid, input.competitors ?? [], createdAt);
    insertPrompts(pid, input.prompts ?? [], createdAt);
  });
  return getProject(pid)!;
}

export type ProjectPatch = Partial<Omit<ProjectInput, 'competitors' | 'prompts'>>;

export function updateProject(pid: string, patch: ProjectPatch): Project | null {
  const before = getProject(pid);
  if (!before) return null;
  const sets: Record<string, string> = {};
  if (patch.name !== undefined) sets.name = patch.name.trim();
  if (patch.domain !== undefined) sets.domain = normalizeDomain(patch.domain);
  if (patch.aliases !== undefined) sets.aliases_json = JSON.stringify(cleanList(patch.aliases));
  if (patch.description !== undefined) sets.description = patch.description.trim();
  if (patch.industry !== undefined) sets.industry = patch.industry.trim();
  if (patch.market !== undefined) sets.market = patch.market;
  if (patch.language !== undefined) sets.language = patch.language;
  if (patch.engines !== undefined) sets.engines_json = JSON.stringify([...new Set(patch.engines)]);
  if (patch.schedule !== undefined) sets.schedule = patch.schedule;
  const keys = Object.keys(sets);
  if (keys.length) {
    run(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => sets[k]!), nowIso(), pid]);
  }
  const after = getProject(pid)!;
  const entitiesChanged = after.name !== before.name || after.domain !== before.domain || after.aliases.join('|') !== before.aliases.join('|');
  if (entitiesChanged) reanalyzeProject(after);
  return after;
}

export function deleteProject(pid: string): boolean {
  return Number(run('DELETE FROM projects WHERE id = ?', [pid]).changes) > 0;
}

// ---------------------------------------------------------------- competitors

type CompetitorInput = { name: string; domain?: string; aliases?: string[]; color?: string };

function insertCompetitors(pid: string, list: CompetitorInput[], createdAt: string): string[] {
  const used = new Set(listCompetitors(pid).map((c) => c.color));
  const base = Date.parse(createdAt);
  return list.map((c, i) => {
    const color = c.color ?? COMPETITOR_COLORS.find((col) => !used.has(col)) ?? COMPETITOR_COLORS[used.size % COMPETITOR_COLORS.length]!;
    used.add(color);
    const cid = id('cmp');
    // Stagger timestamps by 1 ms so listing order matches input order.
    insert('competitors', {
      id: cid, project_id: pid, name: c.name.trim(), domain: c.domain ? normalizeDomain(c.domain) : '',
      aliases_json: JSON.stringify(cleanList(c.aliases)), color, created_at: new Date(base + i).toISOString(),
    });
    return cid;
  });
}

export function addCompetitors(pid: string, list: CompetitorInput[]): Competitor[] {
  const ids = tx(() => insertCompetitors(pid, list, nowIso()));
  reanalyzeProject(getProject(pid)!);
  return listCompetitors(pid).filter((c) => ids.includes(c.id));
}

export function getCompetitor(cid: string): Competitor | null {
  const row = get<CompetitorRow>('SELECT * FROM competitors WHERE id = ?', [cid]);
  return row ? toCompetitor(row) : null;
}

export function updateCompetitor(cid: string, patch: Partial<CompetitorInput>): Competitor | null {
  const before = getCompetitor(cid);
  if (!before) return null;
  run('UPDATE competitors SET name = ?, domain = ?, aliases_json = ?, color = ? WHERE id = ?', [
    patch.name?.trim() ?? before.name,
    patch.domain !== undefined ? normalizeDomain(patch.domain) : before.domain,
    JSON.stringify(patch.aliases !== undefined ? cleanList(patch.aliases) : before.aliases),
    patch.color ?? before.color,
    cid,
  ]);
  const after = getCompetitor(cid)!;
  if (after.name !== before.name || after.domain !== before.domain || after.aliases.join('|') !== before.aliases.join('|')) {
    reanalyzeProject(getProject(after.projectId)!);
  }
  return after;
}

export function deleteCompetitor(cid: string): boolean {
  const c = getCompetitor(cid);
  if (!c) return false;
  run('DELETE FROM competitors WHERE id = ?', [cid]);
  reanalyzeProject(getProject(c.projectId)!);
  return true;
}

// ---------------------------------------------------------------- prompts

export function toPrompt(r: PromptRow): Prompt {
  return {
    id: r.id, projectId: r.project_id, text: r.text, topic: r.topic, tier: r.tier as PromptTier, intent: r.intent as PromptIntent,
    active: r.active === 1, createdAt: r.created_at,
  };
}

export function listPrompts(pid: string): Prompt[] {
  return all<PromptRow>('SELECT * FROM prompts WHERE project_id = ? ORDER BY created_at, rowid', [pid]).map(toPrompt);
}

export function getPrompt(promptId: string): Prompt | null {
  const row = get<PromptRow>('SELECT * FROM prompts WHERE id = ?', [promptId]);
  return row ? toPrompt(row) : null;
}

/** Inserts prompts, skipping texts the project already tracks (case-insensitive). Returns new ids. */
function insertPrompts(pid: string, inputs: PromptInput[], createdAt: string): string[] {
  const existing = new Set(all<{ t: string }>('SELECT lower(text) t FROM prompts WHERE project_id = ?', [pid]).map((r) => r.t));
  const ids: string[] = [];
  for (const p of inputs) {
    const text = p.text.trim().replace(/\s+/g, ' ');
    if (!text || existing.has(text.toLowerCase())) continue;
    existing.add(text.toLowerCase());
    const promptId = id('pmt');
    insert('prompts', {
      id: promptId, project_id: pid, text, topic: p.topic?.trim() ?? '', tier: p.tier ?? 'core', intent: p.intent ?? 'discovery',
      active: p.active ?? true, created_at: createdAt,
    });
    ids.push(promptId);
  }
  return ids;
}

export function createPrompts(pid: string, inputs: PromptInput[]): Prompt[] {
  const ids = tx(() => insertPrompts(pid, inputs, nowIso()));
  return listPrompts(pid).filter((p) => ids.includes(p.id));
}

export function updatePrompt(promptId: string, patch: Partial<PromptInput>): Prompt | null {
  const p = getPrompt(promptId);
  if (!p) return null;
  run('UPDATE prompts SET text = ?, topic = ?, tier = ?, intent = ?, active = ? WHERE id = ?', [
    patch.text?.trim() || p.text, patch.topic ?? p.topic, patch.tier ?? p.tier, patch.intent ?? p.intent,
    (patch.active ?? p.active) ? 1 : 0, promptId,
  ]);
  return getPrompt(promptId);
}

export function deletePrompt(promptId: string): boolean {
  return Number(run('DELETE FROM prompts WHERE id = ?', [promptId]).changes) > 0;
}

// ---------------------------------------------------------------- suggestions

const INDUSTRY_HINTS: [RegExp, string][] = [
  [/help ?desk|customer support|ticketing|customer service|support (team|software|platform)/i, 'Customer Support Software'],
  [/project management|task management|work management|kanban|roadmap/i, 'Project Management Software'],
  [/\bcrm\b|sales pipeline|sales engagement/i, 'CRM Software'],
  [/e-?commerce|online store|storefront/i, 'E-commerce Platform'],
  [/marketing automation|email marketing|\bseo\b|social media/i, 'Marketing Software'],
  [/analytics|business intelligence|dashboards?/i, 'Analytics Software'],
  [/payroll|\bhr\b|human resources|recruit|applicant tracking/i, 'HR Software'],
  [/accounting|invoic|bookkeeping|expense/i, 'Accounting Software'],
  [/security|identity|password|compliance/i, 'Security Software'],
  [/developer|\bapi\b|devops|observability|monitoring/i, 'Developer Tools'],
  [/design|prototyp|whiteboard/i, 'Design Software'],
  [/video|meeting|webinar/i, 'Video Conferencing Software'],
];

async function fetchHomepage(domain: string): Promise<{ title: string; description: string; siteName: string }> {
  const empty = { title: '', description: '', siteName: '' };
  try {
    // SSRF-safe: public hosts only, redirects re-checked, body capped.
    const res = await safeFetch(`https://${domain}`, {
      timeoutMs: 10_000,
      maxBytes: 1_000_000,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; AIVisibilityBot/0.1)', accept: 'text/html' },
    });
    if (res.status < 200 || res.status >= 300 || !(res.headers.get('content-type') ?? '').includes('html')) return empty;
    const $ = cheerio.load(new TextDecoder().decode(res.body));
    const meta = (sel: string) => $(sel).attr('content')?.trim() ?? '';
    return {
      title: $('title').first().text().trim().slice(0, 200),
      description: (meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 400),
      siteName: meta('meta[property="og:site_name"]'),
    };
  } catch {
    return empty;
  }
}

const LlmSuggestion = z.object({
  description: z.string().default(''),
  industry: z.string().default(''),
  aliases: z.array(z.string()).default([]),
  competitors: z.array(z.object({ name: z.string().min(1), domain: z.string().default('') })).default([]),
  prompts: z.array(z.object({
    text: z.string().min(3),
    topic: z.string().optional(),
    tier: z.enum(['must_win', 'core', 'foundational']).catch('core'),
    intent: z.enum(['discovery', 'comparison', 'alternatives', 'how_to', 'branded']).catch('discovery'),
  })).default([]),
});

async function suggestWithLlm(name: string, domain: string, description?: string): Promise<ProjectSuggestion | null> {
  const res = await llmComplete({
    purpose: 'suggest',
    system: 'You are a B2B market analyst setting up AI-search visibility tracking for a company. Reply with a single JSON object and nothing else.',
    prompt: [
      `Company: ${name}`, `Website: ${domain}`, description ? `Description: ${description}` : '',
      'Return JSON with keys:',
      '"description" (one sentence), "industry" (short category label, e.g. "Customer Support Software"),',
      '"aliases" (other names or spellings of the brand), "competitors" (5 direct competitors as {"name","domain"}),',
      '"prompts" (20 realistic questions buyers ask AI assistants when researching this category, as {"text","topic","tier","intent"};',
      'tier is "must_win" | "core" | "foundational"; intent is "discovery" | "comparison" | "alternatives" | "how_to" | "branded";',
      'mostly unbranded, include 3 comparisons naming competitors and 2 branded questions).',
    ].filter(Boolean).join('\n'),
    json: true,
    maxTokens: 3000,
  });
  if (!res) return null;
  const parsed = LlmSuggestion.safeParse(parseJson(res.text, null));
  if (!parsed.success || !parsed.data.prompts.length) return null;
  const d = parsed.data;
  return {
    description: d.description, industry: d.industry, aliases: cleanList(d.aliases),
    competitors: d.competitors.slice(0, 8).map((c) => ({ name: c.name.trim(), domain: normalizeDomain(c.domain) })),
    prompts: d.prompts.slice(0, 30), mode: 'llm',
  };
}

/** Setup suggestions for a new project: LLM when an engine is live, else homepage metadata + prompt templates. */
export async function suggestProject(input: { name: string; domain: string; description?: string }): Promise<ProjectSuggestion> {
  const domain = normalizeDomain(input.domain);
  if (hasLlm()) {
    const s = await suggestWithLlm(input.name, domain, input.description);
    if (s) return s;
  }
  const page = await fetchHomepage(domain);
  const description = input.description?.trim() || page.description || page.title;
  const haystack = `${input.description ?? ''} ${page.title} ${page.description}`;
  const industry = INDUSTRY_HINTS.find(([re]) => re.test(haystack))?.[1] ?? 'Software';
  const aliases = cleanList([page.siteName]).filter((a) => a.toLowerCase() !== input.name.trim().toLowerCase());
  return {
    description, industry, aliases, competitors: [],
    prompts: promptTemplatesFor({ brand: input.name.trim(), industry, description, competitors: [] }),
    mode: 'heuristic',
  };
}

// ---------------------------------------------------------------- ingest token

/** 32 random characters; sent as `Authorization: Bearer …` by server snippets and log shipping. */
export const newIngestToken = () => id('it', 32);

/** Gives every project created before tokens existed one (idempotent; runs at startup). */
export function backfillIngestTokens(): void {
  for (const { id: pid } of all<{ id: string }>('SELECT id FROM projects WHERE ingest_token IS NULL')) {
    run('UPDATE projects SET ingest_token = ? WHERE id = ? AND ingest_token IS NULL', [newIngestToken(), pid]);
  }
}

export function ingestTokenOf(projectId: string): string | null {
  return get<{ t: string | null }>('SELECT ingest_token t FROM projects WHERE id = ?', [projectId])?.t ?? null;
}

/** Issues a new token; the old one stops working immediately. */
export function rotateIngestToken(projectId: string): string {
  const token = newIngestToken();
  run('UPDATE projects SET ingest_token = ? WHERE id = ?', [token, projectId]);
  return token;
}

