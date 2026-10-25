// Crawler & referral aggregates (Hardal-style): totals with deltas, daily trends, breakdowns, missed pages, new agents.
import { all, daysAgo, get } from '../db/index.ts';
import { latestOwnAudit } from '../audit/index.ts';
import { sitemapUrlsCached } from '../audit/sitemap.ts';
import type { AgentCategory, BotEvent, BotVerification, CrawlerOverview, Kpi, Paged, Project, ReferralOverview, SeriesPoint } from '../../../shared/types.ts';
import { AI_CATEGORIES } from './catalog.ts';
import { SPOOFED, VERIFICATION_CODES, VERIFIED, verificationOf } from './verify.ts';

type SiteRef = Pick<Project, 'id' | 'domain' | 'isDemo'>;

export interface Range { from: string; to: string; days: number; prevFrom: string; prevTo: string }

export function rangeFor(days: number): Range {
  return { from: daysAgo(days - 1), to: daysAgo(0), days, prevFrom: daysAgo(2 * days - 1), prevTo: daysAgo(days) };
}

/** Each day in [from, to] inclusive. */
export function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const kpi = (cur: number, prev: number, prevHasData: boolean): Kpi => ({ value: cur, delta: prevHasData ? cur - prev : null });
const share = (n: number, total: number) => (total ? n / total : 0);
const AI_IN = `(${AI_CATEGORIES.map((c) => `'${c}'`).join(',')})`;
/** Spoofed hits (UA names an agent, IP is outside its published ranges) stay in the event log but count nowhere else. */
const REAL = `verified <> ${SPOOFED}`;
const NON_PAGE_RE = /\.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|xml|txt|json|map|gz|pdf)$|^\/(?:\.well-known|wp-|api\/|cdn-cgi)|\/(?:404|500|error)\/?$/i;

/** Daily series keyed by `key` column; days without any event are null for every key (gaps, not zeros). */
function dailySeries(rows: { day: string; k: string; n: number }[], days: string[], keys: string[]): SeriesPoint[] {
  const byDay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let m = byDay.get(r.day);
    if (!m) byDay.set(r.day, (m = new Map()));
    m.set(r.k, r.n);
  }
  return days.map((day) => {
    const m = byDay.get(day);
    const point: SeriesPoint = { day };
    for (const k of keys) point[k] = m ? (m.get(k) ?? 0) : null;
    return point;
  });
}

/** True for HTML-page-like paths (not assets, robots/sitemaps/llms files, or API/system paths). */
export const isPagePath = (p: string) => !NON_PAGE_RE.test(p);

function pathOf(u: string): string | null {
  try {
    return new URL(u).pathname || '/';
  } catch {
    return null;
  }
}

/** Important pages: sitemap URLs (from the latest audit) when available, else every page path ever seen. */
export async function importantPages(site: SiteRef): Promise<{ paths: string[]; source: 'sitemap' | 'known' }> {
  const projectId = site.id;
  // Only the project's own site's sitemap describes its important pages (audits of other URLs are ignored).
  const audit = site.isDemo ? null : latestOwnAudit(site);
  if (audit) {
    const origin = (() => {
      try {
        return new URL(audit.url).origin;
      } catch {
        return `https://${site.domain}`;
      }
    })();
    const sm = await sitemapUrlsCached(audit.robots.sitemaps.length ? audit.robots.sitemaps : [`${origin}/sitemap.xml`]);
    const host = (h: string) => h.toLowerCase().replace(/^www\./, '');
    const siteHost = host(new URL(origin).hostname);
    const paths = sm.urls
      .filter((u) => {
        try {
          return host(new URL(u).hostname) === siteHost;
        } catch {
          return false;
        }
      })
      .map(pathOf)
      .filter((p): p is string => !!p && !NON_PAGE_RE.test(p));
    const depth = (p: string) => p.split('/').filter(Boolean).length;
    if (paths.length) return { paths: [...new Set(paths)].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)), source: 'sitemap' };
  }
  const known = all<{ path: string }>(
    `SELECT DISTINCT path FROM bot_events WHERE project_id = ? AND (status IS NULL OR status BETWEEN 200 AND 299) AND ${REAL}
     UNION SELECT DISTINCT landing_path FROM referral_events WHERE project_id = ?`,
    [projectId, projectId],
  ).map((r) => r.path);
  return { paths: known.filter((p) => !NON_PAGE_RE.test(p)), source: 'known' };
}

/** Important pages that no AI agent (training/search/user_fetch/agent) fetched in the range. */
export async function missedPages(site: SiteRef, r: Range, limit = 50): Promise<CrawlerOverview['missedPages']> {
  const projectId = site.id;
  const { paths, source } = await importantPages(site);
  const seen = new Set(
    all<{ path: string }>(`SELECT DISTINCT path FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND category IN ${AI_IN} AND ${REAL}`, [projectId, r.from, r.to]).map((x) => x.path),
  );
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  const seenNorm = new Set([...seen].map(norm));
  return paths
    .filter((p) => !seenNorm.has(norm(p)))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .slice(0, limit)
    .map((path) => ({ path, source }));
}

/** `missedPages: false` skips the (possibly sitemap-fetching) missed-pages computation, e.g. for reports. */
export async function getCrawlerOverview(site: SiteRef, days: number, opts: { missedPages?: boolean } = {}): Promise<CrawlerOverview> {
  const projectId = site.id;
  const r = rangeFor(days);
  const P = [projectId, r.from, r.to];
  // KPI totals count AI agents only; classic search engines and SEO tools stay visible in the breakdowns and `allVisits`.
  type Totals = { visits: number; agents: number; pages: number; operators: number; all: number; verified: number; spoofed: number; hits: number };
  const ai = `category IN ${AI_IN} AND ${REAL}`;
  const totalsSql = `SELECT SUM(${ai}) visits, COUNT(DISTINCT CASE WHEN ${ai} THEN agent_id END) agents,
    COUNT(DISTINCT CASE WHEN ${ai} THEN path END) pages, COUNT(DISTINCT CASE WHEN ${ai} THEN operator END) operators,
    SUM(${REAL}) "all", SUM(category IN ${AI_IN} AND verified = ${VERIFIED}) verified, SUM(verified = ${SPOOFED}) spoofed, COUNT(*) hits
    FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ?`;
  const cur = get<Totals>(totalsSql, P)!;
  const prev = get<Totals>(totalsSql, [projectId, r.prevFrom, r.prevTo])!;
  for (const t of [cur, prev]) for (const k of ['visits', 'all', 'verified', 'spoofed'] as const) t[k] ??= 0;
  const prevHas = prev.hits > 0;

  const byCategory = all<{ category: AgentCategory; visits: number }>(
    `SELECT category, COUNT(*) visits FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND ${REAL} GROUP BY category ORDER BY visits DESC`, P,
  ).map((c) => ({ ...c, share: share(c.visits, cur.all) }));

  const trendRows = all<{ day: string; k: string; n: number }>(
    `SELECT day, category k, COUNT(*) n FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND ${REAL} GROUP BY day, category`, P,
  );

  const byAgent = all<{ agentId: string; name: string; operator: string; category: AgentCategory; visits: number; pages: number; lastSeen: string }>(
    `SELECT agent_id agentId, MAX(agent_name) name, MAX(operator) operator, MAX(category) category, COUNT(*) visits,
            COUNT(DISTINCT path) pages, MAX(ts) lastSeen
     FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND ${REAL} GROUP BY agent_id ORDER BY visits DESC`, P,
  ).map((a) => ({ ...a, share: share(a.visits, cur.all) }));

  const byOperator = all<{ operator: string; visits: number; agents: number }>(
    `SELECT operator, COUNT(*) visits, COUNT(DISTINCT agent_id) agents FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND ${REAL}
     GROUP BY operator ORDER BY visits DESC`, P,
  ).map((o) => ({ ...o, share: share(o.visits, cur.all) }));

  const pages = all<{ path: string; visits: number; agents: number; lastSeen: string }>(
    `SELECT path, COUNT(*) visits, COUNT(DISTINCT agent_id) agents, MAX(ts) lastSeen
     FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND ${ai} GROUP BY path ORDER BY visits DESC LIMIT 25`, P,
  );
  const topAgentRows = pages.length
    ? all<{ path: string; name: string; n: number }>(
        `SELECT path, agent_name name, COUNT(*) n FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND ${ai}
         AND path IN (${pages.map(() => '?').join(',')}) GROUP BY path, agent_name`,
        [...P, ...pages.map((p) => p.path)],
      )
    : [];
  const topAgent = new Map<string, { name: string; n: number }>();
  for (const t of topAgentRows) if ((topAgent.get(t.path)?.n ?? -1) < t.n) topAgent.set(t.path, t);

  const firstSeen = all<{ agentId: string; name: string; firstSeen: string }>(
    `SELECT agent_id agentId, MAX(agent_name) name, MIN(ts) firstSeen FROM bot_events WHERE project_id = ? AND ${REAL} GROUP BY agent_id`, [projectId],
  );
  // Agents present when tracking started aren't "new": require first sighting ≥ 48h after the project's first event.
  const trackingStart = firstSeen.reduce((m, a) => (a.firstSeen < m ? a.firstSeen : m), '9999');
  const graceEnd = new Date(Date.parse(trackingStart) + 48 * 3600_000).toISOString();
  const newAgents = firstSeen
    .filter((a) => a.firstSeen.slice(0, 10) >= r.from && a.firstSeen >= graceEnd)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  const statusCodes = all<{ status: number; visits: number }>(
    `SELECT status, COUNT(*) visits FROM bot_events WHERE project_id = ? AND day BETWEEN ? AND ? AND status IS NOT NULL AND ${ai}
     GROUP BY status ORDER BY visits DESC`, P,
  );

  return {
    range: { from: r.from, to: r.to, days },
    totals: {
      visits: kpi(cur.visits, prev.visits, prevHas),
      agents: kpi(cur.agents, prev.agents, prevHas),
      pages: kpi(cur.pages, prev.pages, prevHas),
      operators: kpi(cur.operators, prev.operators, prevHas),
      allVisits: kpi(cur.all, prev.all, prevHas),
      verifiedVisits: kpi(cur.verified, prev.verified, prevHas),
      spoofedVisits: kpi(cur.spoofed, prev.spoofed, prevHas),
    },
    trend: dailySeries(trendRows, dayList(r.from, r.to), byCategory.map((c) => c.category)),
    byAgent,
    byOperator,
    byCategory,
    topPages: pages.map((p) => ({ ...p, topAgent: topAgent.get(p.path)?.name ?? '' })),
    missedPages: opts.missedPages !== false && (cur.hits || prevHas) ? await missedPages(site, r) : [],
    newAgents,
    statusCodes,
  };
}

interface BotRow { id: string; ts: string; agent_id: string; agent_name: string; operator: string; category: AgentCategory; path: string; status: number | null; user_agent: string; ip: string; verified: number; source: string }

export interface EventFilter { limit: number; offset: number; agent?: string; category?: string; operator?: string; path?: string; days?: number; verification?: BotVerification }

export function listBotEvents(projectId: string, f: EventFilter): Paged<BotEvent> {
  const where = ['project_id = ?'];
  const params: (string | number)[] = [projectId];
  if (f.agent) (where.push('agent_id = ?'), params.push(f.agent));
  if (f.category) (where.push('category = ?'), params.push(f.category));
  if (f.operator) (where.push('operator = ?'), params.push(f.operator));
  if (f.path) (where.push('path LIKE ?'), params.push(`%${f.path.replace(/[%_]/g, '')}%`));
  if (f.days) (where.push('day >= ?'), params.push(daysAgo(f.days - 1)));
  if (f.verification) (where.push('verified = ?'), params.push(VERIFICATION_CODES[f.verification]));
  const w = where.join(' AND ');
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM bot_events WHERE ${w}`, params)?.n ?? 0;
  const rows = all<BotRow>(`SELECT * FROM bot_events WHERE ${w} ORDER BY ts DESC LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  return {
    items: rows.map((e) => ({
      id: e.id, ts: e.ts, agentId: e.agent_id, agentName: e.agent_name, operator: e.operator, category: e.category, path: e.path,
      status: e.status, userAgent: e.user_agent, ip: e.ip, verified: e.verified === VERIFIED, verification: verificationOf(e.verified), source: e.source,
    })),
    total,
    limit: f.limit,
    offset: f.offset,
  };
}

export function getReferralOverview(projectId: string, days: number): ReferralOverview {
  const r = rangeFor(days);
  const P = [projectId, r.from, r.to];
  type Totals = { visits: number; sources: number; landingPages: number };
  const sql = 'SELECT COUNT(*) visits, COUNT(DISTINCT source_id) sources, COUNT(DISTINCT landing_path) landingPages FROM referral_events WHERE project_id = ? AND day BETWEEN ? AND ?';
  const cur = get<Totals>(sql, P)!;
  const prev = get<Totals>(sql, [projectId, r.prevFrom, r.prevTo])!;
  const prevHas = prev.visits > 0;
  const bySource = all<{ sourceId: string; name: string; visits: number }>(
    'SELECT source_id sourceId, MAX(source_name) name, COUNT(*) visits FROM referral_events WHERE project_id = ? AND day BETWEEN ? AND ? GROUP BY source_id ORDER BY visits DESC', P,
  ).map((s) => ({ ...s, share: share(s.visits, cur.visits) }));
  const trendRows = all<{ day: string; k: string; n: number }>(
    'SELECT day, source_id k, COUNT(*) n FROM referral_events WHERE project_id = ? AND day BETWEEN ? AND ? GROUP BY day, source_id', P,
  );
  const landing = all<{ path: string; visits: number }>(
    'SELECT landing_path path, COUNT(*) visits FROM referral_events WHERE project_id = ? AND day BETWEEN ? AND ? GROUP BY landing_path ORDER BY visits DESC LIMIT 20', P,
  );
  const topSrc = new Map<string, { name: string; n: number }>();
  if (landing.length) {
    for (const t of all<{ path: string; name: string; n: number }>(
      `SELECT landing_path path, source_name name, COUNT(*) n FROM referral_events WHERE project_id = ? AND day BETWEEN ? AND ?
       AND landing_path IN (${landing.map(() => '?').join(',')}) GROUP BY landing_path, source_name`,
      [...P, ...landing.map((l) => l.path)],
    )) if ((topSrc.get(t.path)?.n ?? -1) < t.n) topSrc.set(t.path, t);
  }
  return {
    range: { from: r.from, to: r.to, days },
    totals: { visits: kpi(cur.visits, prev.visits, prevHas), sources: kpi(cur.sources, prev.sources, prevHas), landingPages: kpi(cur.landingPages, prev.landingPages, prevHas) },
    trend: dailySeries(trendRows, dayList(r.from, r.to), bySource.map((s) => s.sourceId)),
    bySource,
    topLandingPages: landing.map((l) => ({ ...l, topSource: topSrc.get(l.path)?.name ?? '' })),
  };
}

/** Most recent non-demo event (bot or referral) — "is the integration live?". */
export function lastEventAt(projectId: string): string | null {
  const row = get<{ t: string | null }>(
    `SELECT MAX(t) t FROM (SELECT MAX(ts) t FROM bot_events WHERE project_id = ?
     UNION ALL SELECT MAX(ts) t FROM referral_events WHERE project_id = ?)`,
    [projectId, projectId],
  );
  return row?.t ?? null;
}
