// Act: one-click drafts (llms.txt, robots.txt, JSON-LD, comparison page, FAQ, content brief, outreach email).
// Uses the live LLM when configured (mode 'llm'); otherwise specific templates filled with the project's real data.
import { all, get, id, nowIso, parseJson, run } from '../db/index.ts';
import { extractJson, hasLlm, llmComplete } from '../lib/llm.ts';
import { agentCatalog } from '../crawlers/catalog.ts';
import { importantPages, isPagePath } from '../crawlers/overview.ts';
import { ensureAudit } from '../audit/index.ts';
import { parseRobots } from '../audit/robots.ts';
import { sourceDomainsFor } from '../data/sources.ts';
import type { AuditResult, Competitor, Draft, DraftKind, DraftRequest, Project } from '../../../shared/types.ts';
import { computeDiagnosis, ENGINE_NAMES, entityStats, negativeThemes, pct, type DiagnosisContext, type MentionRow, type PromptRow } from './diagnose.ts';
import { markRecommendationInProgress } from './recommendations.ts';

interface Ctx {
  project: Project;
  B: string;
  origin: string;
  desc: string;
  year: number;
  diag: DiagnosisContext;
  audit: AuditResult | null;
  pages: string[];            // known site paths, most-crawled first
  pagesKnown: boolean;        // false ⇒ paths are suggestions
  prompts: PromptRow[];       // must_win first
}
interface Built { title: string; body: string; meta: Record<string, unknown> }
type Params = Record<string, string>;

const TIER_ORDER = { must_win: 0, core: 1, foundational: 2 } as const;
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page';
const ACRONYMS = new Set(['api', 'ai', 'sso', 'saml', 'roi', 'faq', 'crm', 'sla', 'seo', 'b2b', 'saas', 'gdpr', 'soc', 'ui', 'ux', 'llm']);
const titleCase = (s: string) =>
  s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
const sentence = (s: string) => (s && !/[.!?]$/.test(s.trim()) ? `${s.trim()}.` : s.trim());
const asQuestion = (s: string) => (/[?]$/.test(s.trim()) ? s.trim() : `${s.trim().replace(/[.!]$/, '')}?`);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export class DraftError extends Error {
  status = 400;
}

async function buildCtx(project: Project): Promise<Ctx> {
  const diag = computeDiagnosis(project);
  const audit = ensureAudit(project);
  const visited = all<{ path: string }>(
    `SELECT path FROM bot_events WHERE project_id = ? AND (status IS NULL OR status BETWEEN 200 AND 299)
     GROUP BY path ORDER BY COUNT(*) DESC LIMIT 300`,
    [project.id],
  ).map((r) => r.path).filter(isPagePath);
  const important = await importantPages(project);
  const pages = [...new Set([...visited, ...important.paths])];
  const prompts = [...diag.data.prompts.values()].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.text.localeCompare(b.text));
  const origin = (() => {
    try {
      return audit && !project.isDemo ? new URL(audit.url).origin : `https://${project.domain}`;
    } catch {
      return `https://${project.domain}`;
    }
  })();
  return {
    project, B: project.name, origin, year: new Date().getUTCFullYear(), diag, audit, prompts,
    desc: sentence(project.description) || `${project.name} is a ${(project.industry || 'software').toLowerCase()} company.`,
    pages, pagesKnown: pages.length > 0,
  };
}

// ---------- shared data helpers ----------

/** Third-party domains cited in a set of responses (all responses when omitted), most cited first. */
function topSources(ctx: Ctx, responseIds?: Set<string>, n = 6): { domain: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of ctx.diag.data.responses) {
    if (responseIds && !responseIds.has(r.id)) continue;
    for (const c of ctx.diag.data.citations.get(r.id) ?? []) if (c.sourceType === 'third_party') counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([domain, count]) => ({ domain, count }));
}

function bestContext(rows: MentionRow[], positive: boolean): string | null {
  const sorted = rows.filter((r) => r.context.trim().length > 30).sort((a, b) => (positive ? b.sentiment - a.sentiment : a.sentiment - b.sentiment));
  return sorted[0]?.context.trim() ?? null;
}

function promptVis(ctx: Ctx, key: string, promptId: string): number {
  const ent = key === 'brand' ? ctx.diag.brand : ctx.diag.competitors.find((c) => c.stats.entity.key === key);
  const v = ent?.stats.promptVis.get(promptId);
  return v && v.n ? v.m / v.n : 0;
}

// Localized sites (/en-US/docs/...): classify by the path without its language prefix.
const LANGS = new Set(['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ja', 'ko', 'zh', 'ru', 'pl', 'sv', 'da', 'fi', 'no', 'nb', 'tr', 'ar', 'he', 'cs', 'hu', 'ro', 'uk', 'id', 'th', 'vi', 'el']);
function localeOf(path: string): string | null {
  const seg = path.split('/')[1] ?? '';
  return /^[a-z]{2}(?:[-_][a-z]{2,4})?$/i.test(seg) && LANGS.has(seg.slice(0, 2).toLowerCase()) ? seg : null;
}
const unlocalized = (path: string) => {
  const l = localeOf(path);
  return l ? path.slice(l.length + 1) || '/' : path;
};
/** Keeps unprefixed pages plus the most common locale (so a 30-language sitemap yields one language). */
function primaryLocalePages(paths: string[]): string[] {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const l = localeOf(p);
    if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return paths.filter((p) => {
    const l = localeOf(p);
    return !l || l === main;
  });
}

type Section = 'home' | 'product' | 'docs' | 'compare' | 'integrations' | 'company' | 'blog' | 'other';
function sectionOf(path: string): Section {
  const first = path.split('/')[1]?.toLowerCase() ?? '';
  if (!first) return 'home';
  if (/^(pricing|plans|features?|product|products|platform|solutions|use-cases|enterprise|demo)$/.test(first)) return 'product';
  if (/^(docs|documentation|help|support|guides?|api|developers?|academy|kb)$/.test(first)) return 'docs';
  if (/^(compare|comparison|vs|alternatives?)$/.test(first)) return 'compare';
  if (/^(integrations?|apps|marketplace|connectors|partners)$/.test(first)) return 'integrations';
  if (/^(blog|resources|learn|articles|news|insights|stories)$/.test(first)) return 'blog';
  if (/^(about|company|customers|security|trust|careers|contact|changelog|legal|press)$/.test(first)) return 'company';
  return 'other';
}

function linkLabel(ctx: Ctx, path: string): { label: string; note: string } {
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const sec = sectionOf(path);
  if (!parts.length) return { label: ctx.B, note: `What ${ctx.B} is, who it's for and how it works` };
  if (path.startsWith('/pricing') && parts.length === 1) return { label: 'Pricing', note: "Plans, prices and what's included" };
  if (sec === 'compare') {
    const comp = ctx.project.competitors.find((c) => last.includes(slug(c.name)));
    if (comp) return last.includes('alternative') ? { label: `${comp.name} alternatives`, note: `Options for teams moving off ${comp.name}` } : { label: `${ctx.B} vs ${comp.name}`, note: `How ${ctx.B} compares with ${comp.name}` };
  }
  const label = parts.length === 1 ? titleCase(last) : titleCase(last);
  const notes: Record<Section, string> = {
    home: '', product: `${label} in ${ctx.B}`, docs: `${label} — documentation`, compare: label, integrations: `Connect ${ctx.B} with ${label}`,
    company: `${label}`, blog: `Article: ${label}`, other: label,
  };
  if (parts.length === 1 && sec === 'docs') return { label: 'Documentation', note: `Guides and reference for ${ctx.B}` };
  if (parts.length === 1 && sec === 'product') return { label, note: `Overview of ${ctx.B}'s ${last.toLowerCase()}` };
  if (parts.length === 1 && sec === 'integrations') return { label: 'Integrations', note: `Tools ${ctx.B} connects with` };
  if (parts.length === 1 && sec === 'blog') return { label: titleCase(last), note: `Articles and guides from ${ctx.B}` };
  return { label, note: notes[sec] };
}

function suggestedPages(ctx: Ctx): string[] {
  const b = slug(ctx.B);
  return ['/', '/pricing', '/features', '/docs', '/integrations', ...ctx.project.competitors.slice(0, 3).map((c) => `/compare/${b}-vs-${slug(c.name)}`), '/customers', '/about', '/blog'];
}

// ---------- templates ----------

function llmsTxt(ctx: Ctx): Built {
  const pages = primaryLocalePages(ctx.pagesKnown ? ctx.pages : suggestedPages(ctx)).sort((a, b) => Number(unlocalized(b) === '/') - Number(unlocalized(a) === '/'));
  const groups: Record<string, string[]> = { Product: [], Docs: [], Comparisons: [], Integrations: [], Company: [], Optional: [] };
  const target: Record<Section, keyof typeof groups> = { home: 'Product', product: 'Product', docs: 'Docs', compare: 'Comparisons', integrations: 'Integrations', company: 'Company', blog: 'Optional', other: 'Optional' };
  const limits: Record<string, number> = { Product: 8, Docs: 8, Comparisons: 6, Integrations: 6, Company: 5, Optional: 10 };
  for (const p of pages) {
    const g = target[sectionOf(unlocalized(p))];
    if (groups[g]!.length >= limits[g]!) continue;
    const { label, note } = linkLabel(ctx, unlocalized(p));
    groups[g]!.push(`- [${label}](${ctx.origin}${p}): ${note}`);
  }
  const topics = [...new Set(ctx.prompts.map((p) => p.topic).filter(Boolean))].slice(0, 6);
  const facts = [
    `- Website: ${ctx.origin}/`,
    ...(ctx.project.industry ? [`- Category: ${ctx.project.industry}`] : []),
    ...(ctx.project.market ? [`- Primary market: ${ctx.project.market}`] : []),
    ...(topics.length ? [`- Teams evaluate ${ctx.B} for: ${topics.join(', ').toLowerCase()}`] : []),
    ...(ctx.project.competitors.length ? [`- Often compared with: ${ctx.project.competitors.slice(0, 5).map((c) => c.name).join(', ')}`] : []),
  ];
  const body = [
    `# ${ctx.B}`,
    '',
    `> ${clip(ctx.desc, 300)}`,
    '',
    ...facts,
    '',
    ...Object.entries(groups).filter(([, l]) => l.length).flatMap(([name, lines]) => [`## ${name}`, '', ...lines, '']),
  ].join('\n');
  return {
    title: `llms.txt for ${ctx.project.domain}`,
    body: body.trimEnd() + '\n',
    meta: {
      filename: 'llms.txt', publishAt: `${ctx.origin}/llms.txt`, format: 'https://llmstxt.org',
      notes: ctx.pagesKnown ? `Links come from ${ctx.pages.length} known pages (crawler logs / sitemap).` : 'No page inventory yet — these URLs are suggestions; replace them with real pages before publishing.',
    },
  };
}

function robotsTxt(ctx: Ctx): Built {
  const raw = ctx.audit?.robots.raw;
  const parsed = raw ? parseRobots(raw) : null;
  const catalog = agentCatalog().filter((a) => a.robotsTokens.length);
  // Explicit allows also for user-triggered fetchers that may not consult robots.txt: they document intent.
  const aiAccess = catalog.filter((a) => a.category === 'search' || a.category === 'user_fetch' || a.category === 'agent');
  const training = catalog.filter((a) => a.category === 'training');
  const handled = new Set([...aiAccess, ...training].flatMap((a) => a.robotsTokens.map((t) => t.toLowerCase())));
  const starRules = parsed?.groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules) ?? [];
  const privateDisallows = starRules.filter((r) => !r.allow && r.pattern !== '/').map((r) => `Disallow: ${r.pattern}`);
  const currentlyBlockedTraining = new Set((ctx.audit?.robots.agents ?? []).filter((a) => a.category === 'training' && a.allowed === 'blocked').map((a) => a.agentId));
  const blockedTrain = training.filter((a) => currentlyBlockedTraining.has(a.id));
  const optionalTrain = training.filter((a) => !currentlyBlockedTraining.has(a.id) && ['gptbot', 'claudebot', 'google-extended', 'applebot-extended', 'ccbot', 'meta-externalagent', 'bytespider'].includes(a.id));
  const otherGroups = (parsed?.groups ?? []).filter((g) => !g.agents.includes('*') && g.agents.every((a) => !handled.has(a)));
  const sitemaps = ctx.audit?.robots.sitemaps.length ? ctx.audit.robots.sitemaps : [`${ctx.origin}/sitemap.xml`];
  const tokens = (list: typeof catalog) => [...new Set(list.flatMap((a) => a.robotsTokens))].map((t) => `User-agent: ${t}`);

  const lines = [
    `# robots.txt for ${ctx.project.domain} — drafted ${nowIso().slice(0, 10)}. Review before publishing.`,
    '# Crawlers obey only the most specific group that names them, so private paths are repeated in each group.',
    '',
    `# 1) AI search & user-triggered fetchers: allowed, so ${ctx.B} can be found, quoted and linked in AI answers.`,
    ...tokens(aiAccess),
    'Allow: /',
    ...privateDisallows,
    '',
    '# 2) Model-training crawlers: a policy choice.',
    `#    Allowing them lets models learn ${ctx.B}'s positioning from your own pages instead of only third-party sites.`,
    '#    Blocking them does not affect AI search visibility (that is group 1).',
    ...(blockedTrain.length
      ? ['#    Currently blocked on your site (kept as is — delete this group to allow training):', ...tokens(blockedTrain), 'Disallow: /', '']
      : []),
    ...(optionalTrain.length ? ['#    To opt out of training, uncomment:', ...tokens(optionalTrain).map((l) => `# ${l}`), '# Disallow: /', ''] : ['']),
    ...(otherGroups.length
      ? ['# 3) Other rules kept from your current robots.txt', ...otherGroups.flatMap((g) => [...g.names.map((n) => `User-agent: ${n}`), ...g.rules.map((r) => `${r.allow ? 'Allow' : 'Disallow'}: ${r.pattern}`), ''])]
      : []),
    '# Everyone else (incl. Googlebot and Bingbot, whose indexes feed Gemini, AI Overviews, ChatGPT search and Copilot)',
    'User-agent: *',
    ...(starRules.length ? starRules.map((r) => `${r.allow ? 'Allow' : 'Disallow'}: ${r.pattern}`) : ['Allow: /']),
    '',
    ...sitemaps.map((s) => `Sitemap: ${s}`),
  ];
  return {
    title: `robots.txt for ${ctx.project.domain}`,
    body: lines.join('\n') + '\n',
    meta: {
      filename: 'robots.txt', publishAt: `${ctx.origin}/robots.txt`,
      allowedAgents: aiAccess.map((a) => a.name), trainingBlocked: blockedTrain.map((a) => a.name),
      basedOnCurrentFile: !!raw,
    },
  };
}

function jsonLdScript(obj: unknown): string {
  // Escape every "<" (valid JSON escape) so names like "</script>" or "<!--" can't end or confuse the script block.
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')}\n</script>`;
}

function faqEntries(ctx: Ctx, promptIds: string[], max = 6): { q: string; a: string }[] {
  const B = ctx.B;
  const comp = ctx.project.competitors[0];
  const base: { q: string; a: string }[] = [
    { q: `What is ${B}?`, a: ctx.desc },
    { q: `How much does ${B} cost?`, a: `Current plans and prices are listed at ${ctx.origin}/pricing.` },
    ...(comp ? [{ q: `How does ${B} compare to ${comp.name}?`, a: `See the side-by-side comparison of ${B} and ${comp.name} at ${ctx.origin}/compare/${slug(B)}-vs-${slug(comp.name)}.` }] : []),
  ];
  const fromPrompts = promptIds
    .map((pid) => ctx.diag.data.prompts.get(pid))
    .filter((p): p is PromptRow => !!p)
    .map((p) => ({ q: asQuestion(p.text), a: `[Answer in 2–4 sentences: lead with the direct answer, then explain how ${B} handles it, with one concrete step or number.]` }));
  return [...fromPrompts, ...base].slice(0, max);
}

function schemaJsonLd(ctx: Ctx, params: Params): Built {
  const types = new Set((params.types ?? 'Organization,WebSite,SoftwareApplication,FAQPage').split(',').map((t) => t.trim()).filter(Boolean));
  const software = /software|saas|platform|app|crm|analytics|api|cloud|tool|ai\b/i.test(`${ctx.project.industry} ${ctx.desc}`);
  if (types.has('Product') || types.has('SoftwareApplication')) {
    types.delete('Product');
    types.add(software ? 'SoftwareApplication' : 'Product');
  }
  const url = `${ctx.origin}/`;
  const orgId = `${ctx.origin}/#organization`;
  const graph: Record<string, unknown>[] = [];
  if (types.has('Organization')) {
    graph.push({
      '@type': 'Organization', '@id': orgId, name: ctx.B, url, logo: `${ctx.origin}/logo.png`, description: ctx.desc,
      ...(ctx.project.aliases.length ? { alternateName: ctx.project.aliases.slice(0, 5) } : {}),
      sameAs: [`https://www.linkedin.com/company/${slug(ctx.B)}`, `https://x.com/${slug(ctx.B).replace(/-/g, '')}`, `https://www.g2.com/products/${slug(ctx.B)}/reviews`],
    });
  }
  if (types.has('WebSite')) graph.push({ '@type': 'WebSite', '@id': `${ctx.origin}/#website`, url, name: ctx.B, publisher: { '@id': orgId } });
  if (types.has('SoftwareApplication')) {
    graph.push({
      '@type': 'SoftwareApplication', name: ctx.B, url, description: ctx.desc, applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      publisher: { '@id': orgId }, offers: { '@type': 'Offer', url: `${ctx.origin}/pricing`, availability: 'https://schema.org/InStock' },
    });
  }
  if (types.has('Product')) {
    graph.push({ '@type': 'Product', name: ctx.B, url, description: ctx.desc, brand: { '@id': orgId }, offers: { '@type': 'Offer', url: `${ctx.origin}/pricing`, availability: 'https://schema.org/InStock' } });
  }
  if (types.has('FAQPage')) {
    // Only Q&As whose answers are grounded in project data (no placeholders) go into markup.
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faqEntries(ctx, [], 5).map((e) => ({ '@type': 'Question', name: e.q, acceptedAnswer: { '@type': 'Answer', text: e.a } })),
    });
  }
  const obj = { '@context': 'https://schema.org', '@graph': graph };
  return {
    title: `Structured data (${graph.map((g) => g['@type']).join(', ')}) for ${ctx.project.domain}`,
    body: jsonLdScript(obj) + '\n',
    meta: { placement: 'Add to the <head> of the homepage (FAQPage block on the page that shows the FAQ).', types: graph.map((g) => g['@type']), validate: 'https://validator.schema.org/', replace: ['logo', 'sameAs'] },
  };
}

function resolveCompetitor(ctx: Ctx, params: Params): Competitor {
  const cs = ctx.project.competitors;
  const byParam = cs.find((c) => c.id === params.competitorId) ?? cs.find((c) => c.name.toLowerCase() === (params.competitor ?? '').toLowerCase());
  const topLoser = ctx.diag.diagnosis.lostPrompts[0];
  const comp = byParam ?? cs.find((c) => c.name === topLoser?.winner) ?? cs[0];
  if (!comp) throw new DraftError('This project has no competitors to compare against — add one first.');
  return comp;
}

function comparisonPage(ctx: Ctx, params: Params): Built {
  const comp = resolveCompetitor(ctx, params);
  const B = ctx.B;
  const C = comp.name;
  const cEnt = ctx.diag.competitors.find((c) => c.stats.entity.key === comp.id);
  const lost = ctx.diag.diagnosis.lostPrompts.filter((l) => l.winner === C);
  const extraIds = (params.promptIds ?? '').split(',').filter((pid) => pid && !lost.some((l) => l.promptId === pid));
  const targetPrompts = [
    ...lost.map((l) => ({ id: l.promptId, text: l.text, cv: l.winnerVisibility, bv: l.brandVisibility })),
    ...extraIds.map((pid) => ({ id: pid, text: ctx.diag.data.prompts.get(pid)?.text ?? '', cv: promptVis(ctx, comp.id, pid), bv: promptVis(ctx, 'brand', pid) })).filter((p) => p.text),
  ];
  const comparisonPrompts = targetPrompts.length ? targetPrompts : ctx.prompts.filter((p) => p.intent === 'comparison' || p.intent === 'alternatives').slice(0, 4).map((p) => ({ id: p.id, text: p.text, cv: promptVis(ctx, comp.id, p.id), bv: promptVis(ctx, 'brand', p.id) }));
  const sources = cEnt ? topSources(ctx, cEnt.stats.mentionedIds, 5) : [];
  const cThemes = cEnt ? negativeThemes(cEnt.stats.rows).slice(0, 3) : [];
  const cSays = cEnt ? bestContext(cEnt.stats.rows, true) : null;
  const bSays = bestContext(ctx.diag.brand.stats.rows, true);
  const url = `${ctx.origin}/compare/${slug(B)}-vs-${slug(C)}`;

  const notes = [
    `> **Editor notes (delete before publishing)** — why this page, from the last ${ctx.diag.data.days} days of AI answers:`,
    ...(cEnt ? [`> - Overall visibility: ${C} ${pct(cEnt.stats.visibility)} vs ${B} ${pct(ctx.diag.brand.stats.visibility)}.`] : []),
    ...comparisonPrompts.slice(0, 5).map((p) => `> - "${clip(p.text, 100)}" — ${C} ${pct(p.cv)} vs ${B} ${pct(p.bv)}`),
    ...(sources.length ? [`> - Sources AI cites when recommending ${C}: ${sources.map((s) => `${s.domain} (${s.count})`).join(', ')} — make sure ${B} is listed and current there.`] : []),
    ...(cThemes.length ? [`> - Criticisms of ${C} that AI answers repeat: ${cThemes.map((t) => `${t.theme} (${t.count})`).join(', ')} — address these honestly where ${B} is better.`] : []),
    ...(cSays ? [`> - What answers say about ${C}: "${clip(cSays, 180)}"`] : []),
    ...(bSays ? [`> - What answers say about ${B}: "${clip(bSays, 180)}"`] : []),
  ];
  const faq = comparisonPrompts.slice(0, 5).map((p) => [
    `### ${asQuestion(p.text)}`,
    `[Direct 2–3 sentence answer that names both ${B} and ${C}, states who each is best for, and links to the relevant section above.]`,
    '',
  ].join('\n'));

  const body = [
    ...notes,
    '',
    `# ${B} vs ${C}: an honest comparison (${ctx.year})`,
    '',
    `**Meta title:** ${B} vs ${C} (${ctx.year}): features, pricing & which to choose  `,
    `**Meta description:** ${clip(`Compare ${B} and ${C} side by side: ideal customer, pricing, key features, integrations and migration — so you can pick the right fit.`, 155)}  `,
    `**URL:** ${url}`,
    '',
    '## TL;DR',
    `- **Choose ${B}** if [your strongest, verifiable differentiator — e.g. a capability, price point or segment].`,
    `- **Choose ${C}** if [be fair: where ${C} genuinely fits better — credible pages get cited].`,
    `- Switching from ${C}? See [Migrating from ${C}](#migrating-from-${slug(C)}).`,
    '',
    '## At a glance',
    `| | ${B} | ${C} |`,
    '|---|---|---|',
    '| Best for | [ideal customer] | [ideal customer] |',
    '| Starting price | [from /pricing] | [public list price] |',
    '| Free plan / trial | [yes/no, length] | [yes/no, length] |',
    '| Key strengths | [2–3 items] | [2–3 items] |',
    '| Integrations | [count + top 3] | [count + top 3] |',
    '| Support | [channels, SLA] | [channels, SLA] |',
    `| Last verified | ${nowIso().slice(0, 10)} | ${nowIso().slice(0, 10)} |`,
    '',
    `## Where ${B} stands out`,
    `${ctx.desc} [Expand with 2–3 differentiators, each with a concrete example, number or customer quote.]`,
    '',
    `## Where ${C} is a good fit`,
    `[Describe ${C}'s strengths fairly and the teams it suits best.]`,
    '',
    '## Pricing compared',
    `[Plan-by-plan comparison with dates. Link to ${ctx.origin}/pricing.]`,
    '',
    `## Migrating from ${C}`,
    `[Steps, timeline, import tools and what carries over. Link to docs.]`,
    '',
    '## FAQ',
    '',
    ...faq,
    `*Mark up the FAQ with FAQPage schema and link this page from /pricing, the ${C} alternatives page and llms.txt.*`,
  ].join('\n');
  return {
    title: `${B} vs ${C} comparison page`,
    body: body + '\n',
    meta: { competitorId: comp.id, competitor: C, url, targetPromptIds: comparisonPrompts.map((p) => p.id), sources: sources.map((s) => s.domain) },
  };
}

function faqPage(ctx: Ctx, params: Params): Built {
  const requested = (params.promptIds ?? '').split(',').filter(Boolean);
  const howTo = requested.length
    ? requested
    : [...ctx.diag.brand.stats.promptVis.entries()].filter(([pid]) => ctx.diag.data.prompts.get(pid)?.intent === 'how_to').sort((a, b) => a[1].m / a[1].n - b[1].m / b[1].n).map(([pid]) => pid);
  const entries = faqEntries(ctx, howTo.slice(0, 8), 10);
  const visNotes = howTo.slice(0, 6).map((pid) => {
    const p = ctx.diag.data.prompts.get(pid);
    return p ? `> - "${clip(p.text, 100)}" — ${ctx.B} visible in ${pct(promptVis(ctx, 'brand', pid))} of answers` : '';
  }).filter(Boolean);
  const body = [
    `> **Editor notes (delete before publishing)** — questions AI assistants answer without mentioning ${ctx.B}:`,
    ...visNotes,
    '> Keep answers short and direct (2–4 sentences), server-rendered, and dated. Replace every [bracketed] part.',
    '',
    `# ${ctx.B} FAQ`,
    '',
    ...entries.flatMap((e) => [`## ${e.q}`, e.a, '']),
    '---',
    'FAQPage markup for this page:',
    '',
    jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: entries.map((e) => ({ '@type': 'Question', name: e.q, acceptedAnswer: { '@type': 'Answer', text: e.a } })),
    }),
  ].join('\n');
  return { title: `${ctx.B} FAQ page`, body: body + '\n', meta: { url: `${ctx.origin}/faq`, promptIds: howTo.slice(0, 8), questions: entries.length } };
}

function contentBrief(ctx: Ctx, params: Params): Built {
  const B = ctx.B;
  const byTopic = new Map<string, string[]>();
  for (const p of ctx.prompts) byTopic.set(p.topic || 'General', [...(byTopic.get(p.topic || 'General') ?? []), p.id]);
  const vis = (ids: string[], key: string) => {
    let n = 0;
    let m = 0;
    const ent = key === 'brand' ? ctx.diag.brand : ctx.diag.competitors.find((c) => c.stats.entity.key === key);
    for (const pid of ids) {
      const v = ent?.stats.promptVis.get(pid);
      if (v) (n += v.n), (m += v.m);
    }
    return n ? m / n : 0;
  };
  const topic = params.topic && byTopic.has(params.topic)
    ? params.topic
    : [...byTopic.entries()].sort((a, b) => vis(a[1], 'brand') - vis(b[1], 'brand'))[0]?.[0] ?? params.topic ?? 'General';
  const ids = byTopic.get(topic) ?? [];
  if (!ids.length) throw new DraftError('No tracked prompts for this topic yet — add prompts so the brief can target them.');
  const brandVis = vis(ids, 'brand');
  const leaders = ctx.diag.competitors.map((c) => ({ name: c.stats.entity.name, key: c.stats.entity.key, v: vis(ids, c.stats.entity.key) })).sort((a, b) => b.v - a.v);
  const leader = leaders[0];
  const topicResp = new Set(ctx.diag.data.responses.filter((r) => ids.includes(r.promptId)).map((r) => r.id));
  const sources = topSources(ctx, topicResp, 6);
  const pitchable = sources.filter((x) => !/wikipedia\.org|wikidata\.org/.test(x.domain));
  const firstPrompt = ctx.diag.data.prompts.get(ids[0] ?? '')?.text ?? topic;
  const leaderEnt = leader ? ctx.diag.competitors.find((c) => c.stats.entity.key === leader.key) : undefined;
  const leaderSays = leaderEnt ? bestContext(leaderEnt.stats.rows.filter((r) => topicResp.has(r.responseId)), true) : null;
  const weakEngines = [...new Set(ctx.diag.data.responses.map((r) => r.engine))]
    .map((e) => ({ e, v: entityStats(ctx.diag.data, ctx.diag.data.entities[0]!, ctx.diag.data.responses.filter((r) => r.engine === e && topicResp.has(r.id))).visibility }))
    .sort((a, b) => a.v - b.v);
  const target = Math.min(80, Math.max(30, Math.round((Math.max(brandVis, leader?.v ?? 0) * 100 + 10) / 5) * 5));
  const compNames = ctx.project.competitors.slice(0, 3).map((c) => c.name);
  const internal = ctx.pages.filter((p) => ['product', 'docs', 'compare'].includes(sectionOf(unlocalized(p)))).slice(0, 5);
  const body = [
    `# Content brief: ${topic}`,
    '',
    `**Goal:** make ${B} a cited answer for "${topic}" prompts. Today ${B} appears in ${pct(brandVis)} of these answers${leader ? `; ${leader.name} appears in ${pct(leader.v)}` : ''}.`,
    `**Format:** in-depth guide (1,800–2,500 words), server-rendered, with a comparison table, an FAQ block and FAQPage + Article schema.`,
    `**Suggested URL:** ${ctx.origin}/blog/${slug(firstPrompt.replace(/[?!.]+$/, ''))}`,
    '',
    '## Target prompts',
    ...ids.slice(0, 8).map((pid, i) =>
      `${i + 1}. "${ctx.diag.data.prompts.get(pid)?.text}" — ${B} ${pct(promptVis(ctx, 'brand', pid))}${leader ? `, ${leader.name} ${pct(promptVis(ctx, leader.key, pid))}` : ''}`),
    '',
    '## What AI answers rely on today',
    ...(sources.length ? sources.map((s) => `- ${s.domain} — cited ${s.count}×`) : ['- No citations collected for this topic yet.']),
    ...(leaderSays ? ['', `What answers say about ${leader!.name}: "${clip(leaderSays, 220)}"`] : []),
    ...(weakEngines.length > 1 ? ['', `Weakest engine for this topic: ${ENGINE_NAMES[weakEngines[0]!.e]} (${pct(weakEngines[0]!.v)} visibility).`] : []),
    '',
    '## Outline',
    `- H1: [working title that answers "${clip(firstPrompt, 100)}"]`,
    `- Intro (≤100 words): a one-sentence definition/answer, then who this guide is for`,
    `- H2: What to look for — evaluation criteria as a checklist`,
    `- H2: Where ${B} fits — concrete capabilities, numbers, screenshots`,
    `- H2: ${[B, ...compNames].join(' vs ')} — comparison table (fair, dated)`,
    `- H2: Step-by-step: [the core how-to]`,
    `- H2: FAQ — use the target prompts above as questions, 2–4 sentence answers`,
    '',
    '## Must include',
    '- Original data or a concrete example AI answers can quote (benchmarks, survey results, customer numbers with permission)',
    '- Author byline with credentials and a visible "last updated" date',
    '- Outbound citations to reputable sources; internal links to:',
    ...(internal.length ? internal.map((p) => `  - ${ctx.origin}${p}`) : [`  - ${ctx.origin}/pricing`, `  - ${ctx.origin}/docs`]),
    '',
    '## Distribution',
    '- Add the page to sitemap.xml and llms.txt; link it from the homepage or main navigation',
    ...(pitchable.length ? [`- Pitch it to ${pitchable.slice(0, 3).map((s) => s.domain).join(', ')} (the sources AI already cites for this topic)`] : []),
    '',
    '## Success metric',
    `- Lift ${B}'s visibility on these prompts from ${pct(brandVis)} to ≥${target}% within 30 days of publishing (tracked in ai visibility).`,
  ].join('\n');
  return { title: `Content brief: ${topic}`, body: body + '\n', meta: { topic, promptIds: ids, brandVisibility: brandVis, targetVisibility: target / 100, sources: sources.map((s) => s.domain) } };
}

function outreachEmail(ctx: Ctx, params: Params): Built {
  const B = ctx.B;
  const data = ctx.diag.data;
  const fallback = topSources(ctx, undefined, 1)[0]?.domain;
  const domain = (params.domain || fallback || '').toLowerCase().replace(/^www\./, '');
  if (!domain) throw new DraftError('No source domain given and no citations collected yet.');
  const siteName = sourceDomainsFor(ctx.project.industry).find((s) => s.domain === domain)?.title ?? titleCase(domain.split('.')[0] ?? domain);
  const respIds = new Set<string>();
  const urls = new Map<string, { title: string; n: number }>();
  for (const r of data.responses) {
    for (const c of data.citations.get(r.id) ?? []) {
      if (c.domain !== domain) continue;
      respIds.add(r.id);
      const u = urls.get(c.url) ?? { title: c.title, n: 0 };
      u.n++;
      urls.set(c.url, u);
    }
  }
  const promptCounts = new Map<string, number>();
  const compCounts = new Map<string, number>();
  let brandIn = 0;
  for (const r of data.responses) {
    if (!respIds.has(r.id)) continue;
    promptCounts.set(r.promptId, (promptCounts.get(r.promptId) ?? 0) + 1);
    const keys = new Set((data.mentions.get(r.id) ?? []).map((m) => m.key));
    if (keys.has('brand')) brandIn++;
    for (const k of keys) if (k !== 'brand') compCounts.set(k, (compCounts.get(k) ?? 0) + 1);
  }
  const prompts = [...promptCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([pid]) => data.prompts.get(pid)?.text ?? '').filter(Boolean);
  const comps = [...compCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => data.entities.find((e) => e.key === k)?.name).filter((x): x is string => !!x);
  const topUrl = [...urls.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const topic = (ctx.project.industry || data.prompts.get([...promptCounts.keys()][0] ?? '')?.topic || 'your category').toLowerCase();
  const brandRate = respIds.size ? brandIn / respIds.size : 0;
  const compRate = respIds.size && comps.length ? Math.max(...[...compCounts.values()]) / respIds.size : 0;
  const presence = !comps.length ? '' : brandRate < 0.15
    ? ` Those answers feature ${comps.join(' and ')}, but rarely ${B}.`
    : compRate > brandRate ? ` Those answers mention ${comps.join(' and ')} more often than ${B} (${pct(compRate)} vs ${pct(brandRate)}).` : '';
  const review = /g2\.com|capterra|trustpilot|getapp|softwareadvice|trustradius|gartner|producthunt/.test(domain);
  const cited = topUrl ? `${siteName} — most often "${clip(topUrl[1].title || topUrl[0], 90)}" (${topUrl[0]}) —` : siteName;
  const asked = prompts.length ? prompts.map((p) => `"${clip(p, 90)}"`).join(' and ') : `questions about ${topic.toLowerCase()}`;

  const body = review
    ? [
        `Subject: Updating ${B}'s profile on ${siteName}`,
        `Alternative subjects: "${B} listing — new screenshots & pricing" · "Review program for ${B} customers"`,
        '',
        `Hi ${siteName} team,`,
        '',
        `I'm [Name], [role] at ${B} (${ctx.project.domain}). ${ctx.desc}`,
        '',
        `${siteName} is one of the sources AI assistants cite most when people ask ${asked}.${presence} We'd like to make sure ${B}'s listing is complete and accurate.`,
        '',
        'Could you help us with:',
        `- Claiming / verifying ${B}'s vendor profile and updating the category, screenshots and pricing`,
        '- Running a review-collection campaign with our customers (we can invite [N] active customers)',
        `- Being considered for the "${topic}" category/comparison pages`,
        '',
        'Thanks!',
        '[Name]',
        `[Title], ${B}`,
      ]
    : [
        `Subject: ${B} for your ${topic} coverage`,
        `Alternative subjects: "A ${topic} option your readers ask about" · "Data for your next ${topic} update"`,
        '',
        `Hi ${siteName} team,`,
        '',
        `I'm [Name], [role] at ${B} (${ctx.project.domain}). ${ctx.desc}`,
        '',
        `AI assistants keep citing ${cited} when people ask questions like ${asked}.${presence}`,
        '',
        `Would you consider including ${B} the next time the piece is updated? Happy to make it easy:`,
        '- A walkthrough or a full-access account for hands-on testing',
        '- Current pricing, screenshots and customer numbers you can verify',
        `- A short expert quote from our [CEO / Head of Product] on ${topic}`,
        '',
        `[One sentence on what makes ${B} different — specific and verifiable.]`,
        '',
        'Thanks for considering it,',
        '[Name]',
        `[Title], ${B} · ${ctx.origin}`,
      ];
  const notes = [
    '',
    '---',
    `Editor notes: ${domain} appeared in ${respIds.size} AI answers in the last ${data.days} days; ${B} was mentioned in ${pct(brandRate)} of them${comps.length ? `, ${comps[0]} in ${pct(compRate)}` : ''}.`,
    ...(topUrl ? [`Most-cited URL: ${topUrl[0]} (${topUrl[1].n}×)`] : []),
    'Find the right contact (editor or vendor-relations team) and personalize the first line before sending.',
  ];
  return {
    title: `Outreach email to ${domain}`,
    body: [...body, ...notes].join('\n') + '\n',
    meta: { domain, citedIn: respIds.size, brandMentionRate: brandRate, competitors: comps, topUrl: topUrl?.[0] ?? null },
  };
}

const TEMPLATES: Record<DraftKind, (ctx: Ctx, params: Params) => Built> = {
  llms_txt: llmsTxt,
  robots_txt: robotsTxt,
  schema_jsonld: schemaJsonLd,
  comparison_page: comparisonPage,
  faq_page: faqPage,
  content_brief: contentBrief,
  outreach_email: outreachEmail,
};

const TASKS: Record<DraftKind, string> = {
  llms_txt: 'Write the site\'s /llms.txt following https://llmstxt.org exactly: "# Name", a "> summary" blockquote, optional detail paragraphs/lists, then "## Section" headings with "- [Title](URL): note" links. Use only the URLs provided. Output plain markdown only.',
  robots_txt: 'Write a robots.txt that explicitly allows AI search and user-triggered agents, keeps existing private-path rules and sitemaps, and documents the training-crawler choice in comments. Output the file only.',
  schema_jsonld: 'Write schema.org JSON-LD (@graph) for the requested types. Output ONLY the JSON object; no script tag, no comments.',
  comparison_page: 'Write a fair, specific comparison page in markdown. Keep the editor notes at the top, the TL;DR, at-a-glance table, sections and FAQ. Never invent prices or numbers — keep [placeholders] for unknown facts.',
  faq_page: 'Write a markdown FAQ page with direct 2–4 sentence answers and the FAQPage JSON-LD block at the end. Keep [placeholders] where facts are unknown.',
  content_brief: 'Write a concise, actionable content brief in markdown for a writer, keeping all the data points provided.',
  outreach_email: 'Write a short, personal outreach email (under 180 words) with a subject line and two alternatives, followed by the editor notes. No flattery, no invented facts.',
};

async function withLlm(kind: DraftKind, ctx: Ctx, built: Built): Promise<{ body: string; mode: 'llm' | 'template'; engine?: string; model?: string }> {
  if (!hasLlm()) return { body: built.body, mode: 'template' };
  const facts = {
    brand: ctx.B, domain: ctx.project.domain, origin: ctx.origin, description: ctx.desc, industry: ctx.project.industry,
    competitors: ctx.project.competitors.map((c) => ({ name: c.name, domain: c.domain })),
    lostPrompts: ctx.diag.diagnosis.lostPrompts.slice(0, 8).map((l) => ({ prompt: l.text, winner: l.winner, winnerVisibility: l.winnerVisibility, brandVisibility: l.brandVisibility })),
    topPrompts: ctx.prompts.slice(0, 10).map((p) => ({ text: p.text, topic: p.topic, intent: p.intent })),
    topSources: topSources(ctx, undefined, 8),
    pages: ctx.pagesKnown ? ctx.pages.slice(0, 40) : [],
  };
  // Stable per-project context goes in the system prompt so repeat drafts can hit the provider's prompt cache;
  // the draft-specific task, details and starting draft follow in the user message.
  const res = await llmComplete({
    system: `You are a Generative Engine Optimization (GEO) specialist producing publish-ready assets for ${ctx.B}. Never invent facts (prices, customers, numbers, URLs); where a fact is unknown keep a clearly marked [placeholder]. Output only the asset.\n\nProject facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
    prompt: `Task: ${TASKS[kind]}\n\nDraft details (JSON):\n${JSON.stringify(built.meta, null, 2)}\n\nStarting draft — improve it and keep its structure:\n${built.body}`,
    maxTokens: 3000,
    json: kind === 'schema_jsonld',
    projectId: ctx.project.id,
    purpose: `draft:${kind}`,
  });
  if (!res?.text.trim()) return { body: built.body, mode: 'template' };
  let body = res.text.trim().replace(/^```[\w-]*\n([\s\S]*?)\n```$/m, '$1');
  if (kind === 'schema_jsonld') {
    const json = extractJson(body);
    if (!json) return { body: built.body, mode: 'template' };
    body = jsonLdScript(JSON.parse(json));
  }
  return { body: body + '\n', mode: 'llm', engine: res.engine, model: res.model };
}

// ---------- persistence ----------

interface DraftRow { id: string; project_id: string; kind: DraftKind; title: string; body: string; status: Draft['status']; meta_json: string; mode: Draft['mode']; created_at: string; updated_at: string }
const toDraft = (r: DraftRow): Draft => ({
  id: r.id, projectId: r.project_id, kind: r.kind, title: r.title, body: r.body, status: r.status, mode: r.mode,
  meta: parseJson<Record<string, unknown>>(r.meta_json, {}), createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function createDraft(project: Project, req: DraftRequest): Promise<Draft> {
  const params = req.params ?? {};
  const ctx = await buildCtx(project);
  const built = TEMPLATES[req.kind](ctx, params);
  const out = await withLlm(req.kind, ctx, built);
  const now = nowIso();
  const row: DraftRow = {
    id: id('drf'), project_id: project.id, kind: req.kind, title: built.title, body: out.body, status: 'draft', mode: out.mode,
    meta_json: JSON.stringify({ ...built.meta, params, ...(out.engine ? { engine: out.engine, model: out.model } : {}) }),
    created_at: now, updated_at: now,
  };
  run(
    'INSERT INTO drafts (id, project_id, kind, title, body, status, meta_json, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [row.id, row.project_id, row.kind, row.title, row.body, row.status, row.meta_json, row.mode, row.created_at, row.updated_at],
  );
  if (params.recKey) markRecommendationInProgress(project.id, params.recKey);
  return toDraft(row);
}

export function listDrafts(projectId: string): Draft[] {
  return all<DraftRow>('SELECT * FROM drafts WHERE project_id = ? ORDER BY created_at DESC', [projectId]).map(toDraft);
}

export function getDraft(draftId: string): Draft | null {
  const r = get<DraftRow>('SELECT * FROM drafts WHERE id = ?', [draftId]);
  return r ? toDraft(r) : null;
}

export function updateDraft(draftId: string, patch: { title?: string; body?: string; status?: Draft['status'] }): Draft | null {
  const cur = getDraft(draftId);
  if (!cur) return null;
  run('UPDATE drafts SET title = ?, body = ?, status = ?, updated_at = ? WHERE id = ?', [
    patch.title ?? cur.title, patch.body ?? cur.body, patch.status ?? cur.status, nowIso(), draftId,
  ]);
  return getDraft(draftId);
}

export function deleteDraft(draftId: string): boolean {
  return Number(run('DELETE FROM drafts WHERE id = ?', [draftId]).changes) > 0;
}
