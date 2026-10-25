// Report: weekly brief (headline, highlights, risks) built from monitor aggregates, diagnosis, recommendations and
// crawler/referral trends — plus CSV exports.
import { all, daysAgo, get, nowIso } from '../db/index.ts';
import { getCrawlerOverview, getReferralOverview, rangeFor } from '../crawlers/overview.ts';
import type { Project, Report } from '../../../shared/types.ts';
import { getOverview } from './monitor.ts';
import { computeDiagnosis, num, pct, plural, shortDate, signed } from './diagnose.ts';
import { listRecommendations } from './recommendations.ts';

const round = (x: number) => Math.round(x);
/** Whole points (BRAND §4: integer points); changes under half a point count as flat. */
const pts = (d: number) => {
  const n = Math.round(Math.abs(d));
  return `${n} ${n === 1 ? 'pt' : 'pts'}`;
};
const isFlat = (d: number | null): d is null => d === null || Math.abs(d) < 0.5;
/** Relative change in percent (`cur` vs `cur - delta`), or null without a usable previous value. */
const changePct = (cur: number, delta: number | null) => (delta === null || cur - delta <= 0 ? null : (delta / (cur - delta)) * 100);
/** `+8.0%` / `−6.3%` / `+12%` (true minus, BRAND percent precision). */
const rel = (ch: number) => `${ch > 0 ? '+' : ''}${pct(ch / 100)}`;
const clip = (t: string, n = 80) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Visibility (0..1) per entity key ('brand' or competitor id) for a day window — used for leaderboard movement. */
function visibilityBetween(projectId: string, from: string, to: string): Map<string, number> {
  const total = get<{ n: number }>('SELECT COUNT(*) n FROM responses WHERE project_id = ? AND day BETWEEN ? AND ? AND error IS NULL', [projectId, from, to])?.n ?? 0;
  const out = new Map<string, number>();
  if (!total) return out;
  for (const r of all<{ k: string; m: number }>(
    `SELECT CASE WHEN entity_type = 'brand' THEN 'brand' ELSE competitor_id END k, COUNT(DISTINCT response_id) m
     FROM mentions WHERE project_id = ? AND day BETWEEN ? AND ? GROUP BY k`,
    [projectId, from, to],
  )) out.set(r.k, r.m / total);
  return out;
}

export async function buildReport(project: Project, days: number): Promise<Report> {
  const B = project.name;
  const overview = getOverview(project.id, { days });
  // Diagnosis, lost prompts and recommendations use the report's own window, so every number in the brief agrees.
  const ctx = computeDiagnosis(project, days);
  const recs = await listRecommendations(project, ctx);
  const hasBots = !!get('SELECT 1 FROM bot_events WHERE project_id = ? LIMIT 1', [project.id]);
  const crawler = hasBots ? await getCrawlerOverview(project, days, { missedPages: false }) : null;
  const referrals = getReferralOverview(project.id, days);
  const period = days === 7 ? 'this week' : `over the last ${days} days`;
  const r = rangeFor(days);

  const k = overview.kpis;
  const lb = overview.leaderboard;
  const me = lb.find((e) => e.isBrand);
  const leader = lb[0];
  const runnerUp = lb.find((e) => !e.isBrand);
  const prevVis = visibilityBetween(project.id, r.prevFrom, r.prevTo);
  const hasPrev = prevVis.size > 0;
  const prevRank = hasPrev
    ? [...lb].sort((a, b) => (prevVis.get(b.key) ?? 0) - (prevVis.get(a.key) ?? 0)).findIndex((e) => e.isBrand) + 1
    : null;

  // ---- headline
  let headline: string;
  if (!overview.totals.responses) {
    headline = `No AI answers were collected for ${B} ${period} — run monitoring to start tracking visibility.`;
  } else {
    const v = k.visibilityScore;
    const trend = v.delta === null ? `stands at ${round(v.value)}` : isFlat(v.delta) ? `held steady at ${round(v.value)}` : `${v.delta > 0 ? 'rose' : 'fell'} ${pts(v.delta)} to ${round(v.value)}`;
    const standing = !me || !leader ? '' : me.rank === 1
      ? `${B} leads the category${runnerUp ? `, ahead of ${runnerUp.name} (${round(runnerUp.visibility * 100)})` : ''}`
      : `${leader.name} still leads at ${round(leader.visibility * 100)} and ${B} ranks #${me.rank} of ${lb.length}`;
    headline = `${B}'s AI visibility ${trend} ${period}${standing ? `; ${standing}` : ''}.`;
  }

  // Bullets carry a rank (lower = more important) so the cap keeps the most decision-relevant ones.
  // Highlights hold improvements and neutral facts only; declines always go to risks.
  const wins: [number, string][] = [];
  const losses: [number, string][] = [];
  const bullet = (good: boolean, rank: number, text: string) => (good ? wins : losses).push([rank, text]);

  // ---- visibility & voice
  const vd = k.visibilityScore.delta;
  if (!isFlat(vd)) bullet(vd > 0, 1, `Visibility ${vd > 0 ? 'up' : 'down'} ${pts(vd)} to ${round(k.visibilityScore.value)}`);
  const sd = k.shareOfVoice.delta;
  if (!isFlat(sd)) bullet(sd > 0, 6, `Share of voice ${sd > 0 ? 'up' : 'down'} ${pts(sd)} to ${round(k.shareOfVoice.value)}%`);
  if (k.sentiment.delta !== null && Math.abs(k.sentiment.delta) >= 2) {
    bullet(k.sentiment.delta > 0, 7, `Sentiment ${k.sentiment.delta > 0 ? 'up' : 'down'} ${pts(k.sentiment.delta)} to ${round(k.sentiment.value)}`);
  }
  const mentionChange = changePct(k.mentions.value, k.mentions.delta);
  if (mentionChange !== null && Math.abs(mentionChange) >= 5) {
    bullet(mentionChange > 0, 8, `${plural(k.mentions.value, 'brand mention')} (${rel(mentionChange)} vs previous period)`);
  }
  if (k.citations.delta !== null && k.citations.delta > 0) {
    bullet(true, 9, `${project.domain} cited ${plural(k.citations.value, 'time')} in AI answers (${signed(k.citations.delta)})`);
  }
  if (me && prevRank !== null && prevRank !== me.rank) {
    bullet(me.rank < prevRank, 1, `${B} moved from #${prevRank} to #${me.rank} on the leaderboard`);
  }

  // ---- competitors
  if (hasPrev) {
    const movers = lb
      .filter((e) => !e.isBrand && prevVis.has(e.key))
      .map((e) => ({ e, d: (e.visibility - (prevVis.get(e.key) ?? 0)) * 100 }))
      .sort((a, b) => b.d - a.d);
    const gainer = movers[0];
    if (gainer && gainer.d >= 3) bullet(false, 2, `${gainer.e.name} gained ${pts(gainer.d)} of visibility (now ${round(gainer.e.visibility * 100)})`);
    const loser = movers[movers.length - 1];
    if (loser && loser.d <= -3) bullet(true, 3, `${loser.e.name} lost ${pts(loser.d)} of visibility (now ${round(loser.e.visibility * 100)})`);
  }

  // ---- engines
  const engines = overview.engines.filter((e) => e.responses > 0).sort((a, b) => b.visibility - a.visibility);
  if (engines.length > 1) {
    const best = engines[0]!;
    const worst = engines[engines.length - 1]!;
    bullet(true, 10, `Strongest engine: ${best.name} (${pct(best.visibility)} visibility)`);
    if (best.visibility - worst.visibility >= 0.1) bullet(false, 5, `Weakest engine: ${worst.name} (${pct(worst.visibility)} vs ${pct(best.visibility)} on ${best.name})`);
  }

  // ---- prompts
  const lost = ctx.diagnosis.lostPrompts;
  if (lost.length) {
    const top = lost[0]!;
    const example = `"${clip(top.text)}" (${top.winner} ${pct(top.winnerVisibility)} vs ${B} ${pct(top.brandVisibility)})`;
    bullet(false, 1, lost.length === 1 ? `1 prompt lost to a competitor: ${example}` : `${plural(lost.length, 'prompt')} lost to competitors, e.g. ${example}`);
  }
  const won = [...ctx.brand.stats.promptVis.values()].filter((v) => v.n > 0 && v.m / v.n >= 0.5).length;
  if (won) bullet(true, 4, `${B} appears in at least half of the answers for ${num(won)} of ${plural(ctx.brand.cov.prompts, 'prompt')}`);
  const s = ctx.brand.sent;
  if (s.mentions >= 5 && s.negative / s.mentions >= 0.15) bullet(false, 4, `${pct(s.negative / s.mentions)} of mentions are negative`);

  // ---- crawlers (AI agents only, same definition as the Crawlers page and Diagnose), referrals, technical
  if (crawler) {
    const t = crawler.totals.visits;
    const ch = changePct(t.value, t.delta);
    if (ch !== null && Math.abs(ch) >= 5) bullet(ch > 0, 5, `AI crawler visits ${ch > 0 ? 'up' : 'down'} ${pct(Math.abs(ch) / 100)} to ${num(t.value)}`);
    for (const a of crawler.newAgents.slice(0, 2)) bullet(true, 5, `New agent: ${a.name} first seen ${shortDate(a.firstSeen)}`);
  }
  const rv = referrals.totals.visits;
  if (rv.value) {
    const ch = changePct(rv.value, rv.delta);
    const top = referrals.bySource[0];
    const source = top ? ` — ${top.name} sends ${pct(top.share)}` : '';
    if (ch === null) bullet(true, 3, `${plural(rv.value, 'visit')} from AI assistants${source}`);
    else if (ch >= 1) bullet(true, 3, `${plural(rv.value, 'visit')} from AI assistants (${rel(ch)})${source}`);
    else if (ch <= -5) bullet(false, 3, `Visits from AI assistants down ${pct(Math.abs(ch) / 100)} to ${num(rv.value)}${source}`);
  }
  if (ctx.tech.blocked.length) bullet(false, 3, `robots.txt blocks AI search agents: ${ctx.tech.blocked.slice(0, 4).join(', ')}`);
  if (ctx.tech.audit && ctx.tech.audit.score < 60) bullet(false, 6, `AI-readiness score is ${ctx.tech.audit.score}/100`);
  const ranked = (list: [number, string][]) => [...list].sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]); // stable sort

  return {
    project: { id: project.id, name: project.name, domain: project.domain },
    generatedAt: nowIso(),
    range: { from: daysAgo(days - 1), to: daysAgo(0), days },
    headline,
    highlights: ranked(wins),
    risks: ranked(losses),
    overview,
    diagnosis: ctx.diagnosis,
    topRecommendations: recs.filter((x) => x.status === 'open' || x.status === 'in_progress').slice(0, 5),
    crawlers: crawler ? { totals: crawler.totals, byOperator: crawler.byOperator } : null,
  };
}

// ---------- CSV export ----------

export const EXPORT_KINDS = ['responses', 'mentions', 'citations', 'bot_events', 'prompts'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** RFC 4180 cell; strings that spreadsheets would execute as formulas are prefixed with a quote. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return `﻿${[columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n')}\r\n`;
}

export function exportCsv(project: Project, kind: ExportKind, days: number): string {
  const from = daysAgo(days - 1);
  const P = [project.id, from];
  switch (kind) {
    case 'responses':
      return toCsv(
        ['id', 'created_at', 'day', 'engine', 'model', 'mode', 'prompt_id', 'prompt', 'brand_mentioned', 'brand_position', 'brand_sentiment', 'latency_ms', 'error', 'text'],
        all(`SELECT r.id, r.created_at, r.day, r.engine, r.model, r.mode, r.prompt_id, p.text prompt, r.brand_mentioned, r.brand_position,
                    r.brand_sentiment, r.latency_ms, r.error, r.text
             FROM responses r LEFT JOIN prompts p ON p.id = r.prompt_id WHERE r.project_id = ? AND r.day >= ? ORDER BY r.created_at DESC`, P),
      );
    case 'mentions':
      return toCsv(
        ['id', 'day', 'engine', 'prompt_id', 'prompt', 'entity_type', 'entity_name', 'competitor_id', 'position', 'count', 'sentiment', 'sentiment_label', 'context', 'response_id'],
        all(`SELECT m.id, m.day, m.engine, m.prompt_id, p.text prompt, m.entity_type, m.entity_name, m.competitor_id, m.position, m.count,
                    m.sentiment, m.sentiment_label, m.context, m.response_id
             FROM mentions m LEFT JOIN prompts p ON p.id = m.prompt_id WHERE m.project_id = ? AND m.day >= ? ORDER BY m.day DESC, m.response_id, m.position`, P),
      );
    case 'citations':
      return toCsv(
        ['id', 'day', 'engine', 'prompt_id', 'prompt', 'url', 'domain', 'title', 'position', 'source_type', 'competitor_id', 'response_id'],
        all(`SELECT c.id, c.day, c.engine, c.prompt_id, p.text prompt, c.url, c.domain, c.title, c.position, c.source_type, c.competitor_id, c.response_id
             FROM citations c LEFT JOIN prompts p ON p.id = c.prompt_id WHERE c.project_id = ? AND c.day >= ? ORDER BY c.day DESC, c.response_id, c.position`, P),
      );
    case 'bot_events':
      return toCsv(
        ['id', 'ts', 'agent_id', 'agent_name', 'operator', 'category', 'path', 'status', 'user_agent', 'ip', 'verified', 'source'],
        all('SELECT id, ts, agent_id, agent_name, operator, category, path, status, user_agent, ip, verified, source FROM bot_events WHERE project_id = ? AND day >= ? ORDER BY ts DESC', P),
      );
    case 'prompts':
      return toCsv(
        ['id', 'text', 'topic', 'tier', 'intent', 'active', 'created_at', 'responses', 'brand_mentions', 'visibility'],
        all(`SELECT p.id, p.text, p.topic, p.tier, p.intent, p.active, p.created_at, COUNT(r.id) responses, COALESCE(SUM(r.brand_mentioned), 0) brand_mentions,
                    ROUND(CASE WHEN COUNT(r.id) > 0 THEN 1.0 * SUM(r.brand_mentioned) / COUNT(r.id) ELSE 0 END, 4) visibility
             FROM prompts p LEFT JOIN responses r ON r.prompt_id = p.id AND r.day >= ? AND r.error IS NULL
             WHERE p.project_id = ? GROUP BY p.id ORDER BY p.created_at, p.text`, [from, project.id]),
      );
  }
}
