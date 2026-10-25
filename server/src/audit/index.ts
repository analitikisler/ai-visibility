// AI-readiness audit: fetch homepage + robots.txt + llms.txt + sitemap, build weighted checks, persist.
import { all, id, insert, nowIso, parseJson } from '../db/index.ts';
import { agentCatalog } from '../crawlers/catalog.ts';
import { assertPublicUrl, BlockedUrlError } from '../lib/safe-fetch.ts';
import type { AuditResult, Project } from '../../../shared/types.ts';
import { buildChecks, scoreCap, scoreChecks, type AuditFacts } from './checks.ts';
import { fetchText, looksLikeHtml } from './http.ts';
import { analyzeHtml, type PageAnalysis } from './page.ts';
import { parseRobots, robotsAgentRules } from './robots.ts';
import { cacheSitemapUrls, fetchSitemapUrls } from './sitemap.ts';

const DEFAULT_SAMPLE_PATHS = ['/', '/blog/', '/docs/', '/pricing', '/about', '/products/', '/features/'];
const RAW_ROBOTS_CAP = 32 * 1024;

/** Accepts "example.com", "https://example.com/x"; returns an absolute http(s) URL or null. */
export function normalizeAuditUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

function llmsFacts(r: Awaited<ReturnType<typeof fetchText>>, url: string): AuditFacts['llms'] {
  const servedHtml = r.ok && looksLikeHtml(r);
  const found = r.ok && !servedHtml && r.body.trim().length > 0;
  const body = found ? r.body : '';
  const firstLine = body.split(/\r?\n/).find((l) => l.trim()) ?? '';
  return {
    found, status: r.status, servedHtml, url, bytes: found ? r.bytes : 0,
    preview: body.slice(0, 800),
    hasTitle: /^#\s+\S/.test(firstLine.trim()),
    hasSummary: /^>\s*\S/m.test(body),
    links: (body.match(/\]\((?:https?:\/\/|\/)[^)]+\)/g) ?? []).length,
  };
}

/** Assembles the persisted AuditResult shape from facts. */
function toResult(projectId: string, f: AuditFacts, page: PageAnalysis | null, rawRobots: string | undefined): AuditResult {
  const cap = scoreCap(f);
  const checks = buildChecks(f);
  if (cap) {
    checks.unshift({
      id: 'score_cap', group: 'crawlability', title: `Score capped at ${cap.cap}`, status: 'info', weight: 0,
      detail: `The score is limited to ${cap.cap} because ${cap.reason} — fix that first; other improvements can't compensate.`,
    });
  }
  return {
    id: id('aud'),
    projectId,
    url: f.finalUrl || f.url,
    score: scoreChecks(checks, cap?.cap),
    createdAt: nowIso(),
    checks,
    robots: { found: f.robots.found, agents: f.robots.agents, sitemaps: f.robots.parsed?.sitemaps ?? [], raw: rawRobots },
    llmsTxt: { found: f.llms.found, url: f.llms.url, bytes: f.llms.bytes, preview: f.llms.preview },
    page: {
      title: page?.title ?? '',
      metaDescription: page?.metaDescription ?? '',
      h1: page?.h1 ?? [],
      wordCount: page?.wordCount ?? 0,
      schemaTypes: page?.schemaTypes ?? [],
      ogTags: page?.ogTags ?? {},
      canonical: page?.canonical ?? null,
      lang: page?.lang ?? null,
      statusCode: f.homepage.status,
      responseMs: f.homepage.status !== null ? f.homepage.ms : null,
    },
  };
}

/** Live audit of a URL. Never throws for network problems — unreachable sites yield failing checks. */
export async function auditUrl(projectId: string, target: string, explicitScheme: boolean): Promise<AuditResult> {
  let home = await fetchText(target, { timeoutMs: 15_000 });
  if (home.status === null && !explicitScheme && target.startsWith('https://')) {
    const alt = await fetchText(target.replace(/^https:/, 'http:'), { timeoutMs: 10_000 });
    if (alt.status !== null) home = alt;
  }
  const finalUrl = home.status !== null ? home.url : target;
  const origin = new URL(finalUrl).origin;

  const [robotsRes, llmsRes, llmsFullRes] = await Promise.all([
    fetchText(`${origin}/robots.txt`, { timeoutMs: 10_000, maxBytes: 512 * 1024, accept: 'text/plain,*/*;q=0.5' }),
    fetchText(`${origin}/llms.txt`, { timeoutMs: 10_000, maxBytes: 1024 * 1024, accept: 'text/markdown,text/plain,*/*;q=0.5' }),
    fetchText(`${origin}/llms-full.txt`, { timeoutMs: 10_000, maxBytes: 256 * 1024, accept: 'text/markdown,text/plain,*/*;q=0.5' }),
  ]);

  const page = home.ok && home.body ? analyzeHtml(home.body, finalUrl) : null;
  const robotsHtml = robotsRes.ok && looksLikeHtml(robotsRes);
  const robotsFound = robotsRes.ok && !robotsHtml;
  const parsed = robotsFound ? parseRobots(robotsRes.body) : null;
  const samples = page?.internalPaths.length ? ['/', ...page.internalPaths.slice(0, 15)] : DEFAULT_SAMPLE_PATHS;

  const declared = parsed?.sitemaps ?? [];
  const sm = await fetchSitemapUrls(declared.length ? declared : [`${origin}/sitemap.xml`], { timeoutMs: 8000 });
  if (sm.reachableUrl) cacheSitemapUrls(declared.length ? declared : [`${origin}/sitemap.xml`], sm);

  const llmsFullFound = llmsFullRes.ok && !looksLikeHtml(llmsFullRes) && llmsFullRes.body.trim().length > 0;
  const facts: AuditFacts = {
    url: target,
    finalUrl,
    homepage: {
      status: home.status, ms: home.ms, bytes: home.bytes, truncated: home.truncated, error: home.error,
      xRobotsTag: home.headers?.get('x-robots-tag') ?? '',
    },
    page,
    robots: {
      status: robotsRes.status, error: robotsRes.error, found: robotsFound, servedHtml: robotsHtml, parsed,
      agents: robotsAgentRules(parsed, agentCatalog(), samples),
    },
    llms: llmsFacts(llmsRes, `${origin}/llms.txt`),
    llmsFull: {
      found: llmsFullFound,
      bytes: llmsFullFound ? Number(llmsFullRes.headers?.get('content-length')) || llmsFullRes.bytes : 0,
    },
    sitemap: { declared, url: sm.reachableUrl, reachable: !!sm.reachableUrl, urlCount: sm.reachableUrl ? sm.urls.length : null },
  };
  return toResult(projectId, facts, page, robotsFound ? robotsRes.body.slice(0, RAW_ROBOTS_CAP) : undefined);
}

/** Realistic sample audit for demo projects (their domain is fictional), flagged with `demo: true`. */
export function demoAudit(project: Project): AuditResult {
  const origin = `https://${project.domain}`;
  const robotsText = [
    `# robots.txt for ${project.domain}`,
    'User-agent: *',
    'Disallow: /app/',
    'Disallow: /api/',
    'Disallow: /search',
    '',
    '# Added in 2024 to opt out of AI training',
    'User-agent: ClaudeBot',
    'User-agent: Claude-User',
    'Disallow: /',
    '',
    'User-agent: CCBot',
    'Disallow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
  ].join('\n');
  const parsed = parseRobots(robotsText);
  const desc = project.description || `${project.name} ${project.industry ? `— ${project.industry}` : ''}`.trim();
  const page: PageAnalysis = {
    title: `${project.name} — ${(project.industry || 'Software for modern teams').replace(/^\w/, (c) => c.toUpperCase())}`.slice(0, 68),
    metaDescription: desc.slice(0, 48).replace(/\s+\S*$/, ''),
    h1: [`Meet ${project.name}`, 'Trusted by fast-growing teams'],
    wordCount: 182,
    schemaTypes: ['Organization', 'WebSite'],
    jsonLdBlocks: 1,
    jsonLdErrors: 0,
    ogTags: { 'og:title': project.name, 'og:description': desc.slice(0, 160), 'og:type': 'website' },
    canonical: null,
    lang: 'en',
    robotsMeta: '',
    noindex: false,
    nosnippet: false,
    noai: false,
    spaShell: false,
    internalPaths: ['/pricing', '/features/', '/blog/', '/docs/', '/compare/', '/integrations/', '/customers'],
  };
  const facts: AuditFacts = {
    url: origin,
    finalUrl: `${origin}/`,
    homepage: { status: 200, ms: 1380, bytes: 186_000, truncated: false, error: null, xRobotsTag: '' },
    page,
    robots: {
      status: 200, error: null, found: true, servedHtml: false, parsed,
      agents: robotsAgentRules(parsed, agentCatalog(), ['/', ...page.internalPaths]),
    },
    llms: { found: false, status: 404, servedHtml: false, url: `${origin}/llms.txt`, bytes: 0, preview: '', hasTitle: false, hasSummary: false, links: 0 },
    llmsFull: { found: false, bytes: 0 },
    sitemap: { declared: parsed.sitemaps, url: `${origin}/sitemap.xml`, reachable: true, urlCount: 48 },
  };
  return { ...toResult(project.id, facts, page, robotsText), demo: true };
}

const LEGACY_DEMO_PREFIX = 'Demo data: ';
/** Parses a stored audit; older demo audits marked themselves with a text prefix — normalize those to `demo: true`. */
function fromRow(json: string): AuditResult | null {
  const a = parseJson<AuditResult | null>(json, null);
  if (!a || !a.checks.some((c) => c.detail.startsWith(LEGACY_DEMO_PREFIX))) return a;
  return { ...a, demo: true, checks: a.checks.map((c) => ({ ...c, detail: c.detail.replace(LEGACY_DEMO_PREFIX, '') })) };
}

function save(result: AuditResult): AuditResult {
  insert('audits', { id: result.id, project_id: result.projectId, url: result.url, score: result.score, result_json: JSON.stringify(result), created_at: result.createdAt });
  return result;
}

/** Runs (and persists) an audit. Demo projects get the sample audit unless an explicit URL is given. */
export async function runAudit(project: Project, rawUrl?: string): Promise<AuditResult> {
  if (project.isDemo && !rawUrl) return save(demoAudit(project));
  const target = normalizeAuditUrl(rawUrl || project.domain);
  if (!target) throw Object.assign(new Error(`Invalid URL: ${rawUrl || project.domain}`), { status: 400 });
  // Refuse private/internal targets up front (redirects and DNS changes are re-checked on every fetch).
  await assertPublicUrl(target).catch((err: unknown) => {
    throw err instanceof BlockedUrlError ? Object.assign(new Error(`Can't audit this URL: ${err.message}`), { status: 400 }) : err;
  });
  return save(await auditUrl(project.id, target, !!rawUrl && /^https?:\/\//i.test(rawUrl.trim())));
}

export function listAudits(projectId: string, limit = 20): AuditResult[] {
  return all<{ result_json: string }>('SELECT result_json FROM audits WHERE project_id = ? ORDER BY created_at DESC LIMIT ?', [projectId, limit])
    .map((r) => fromRow(r.result_json))
    .filter((r): r is AuditResult => r !== null);
}

/** True when the audited URL is the project's own site (domain or a subdomain of it). */
function isOwnSite(project: Pick<Project, 'domain'>, url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const domain = project.domain.replace(/^www\./, '').toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

/**
 * Latest audit of the project's own site — the one insights (diagnose, recommendations, report) rely on.
 * Audits of other URLs stay in history but don't drive technical readiness.
 * Demo projects get their sample audit created on first use so insights are coherent.
 */
export function ensureAudit(project: Project): AuditResult | null {
  return latestOwnAudit(project) ?? (project.isDemo ? save(demoAudit(project)) : null);
}

/** Latest stored audit of the project's own site (audits of other URLs are ignored), or null. */
export function latestOwnAudit(project: Pick<Project, 'id' | 'domain'>): AuditResult | null {
  return listAudits(project.id, 50).find((a) => isOwnSite(project, a.url)) ?? null;
}
