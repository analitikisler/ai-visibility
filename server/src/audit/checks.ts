// Turns raw audit facts into weighted AuditChecks and a 0..100 score.
import type { AuditCheck, CheckStatus, RobotsAgentRule } from '../../../shared/types.ts';
import type { PageAnalysis } from './page.ts';
import type { ParsedRobots } from './robots.ts';

export interface AuditFacts {
  url: string;
  finalUrl: string;
  homepage: { status: number | null; ms: number | null; bytes: number; truncated: boolean; error: string | null; xRobotsTag: string };
  page: PageAnalysis | null;
  robots: { status: number | null; error: string | null; found: boolean; servedHtml: boolean; parsed: ParsedRobots | null; agents: RobotsAgentRule[] };
  llms: { found: boolean; status: number | null; servedHtml: boolean; url: string; bytes: number; preview: string; hasTitle: boolean; hasSummary: boolean; links: number };
  llmsFull: { found: boolean; bytes: number };
  sitemap: { declared: string[]; url: string | null; reachable: boolean; urlCount: number | null };
}

const ORG_TYPES = ['Organization', 'Corporation', 'LocalBusiness', 'OnlineBusiness', 'OnlineStore', 'NGO', 'EducationalOrganization', 'NewsMediaOrganization', 'ProfessionalService', 'Store'];
const PRODUCT_TYPES = ['Product', 'SoftwareApplication', 'WebApplication', 'MobileApplication', 'Service', 'Offer', 'AggregateOffer', 'ProductGroup'];

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const names = (rules: RobotsAgentRule[]) => rules.map((r) => r.agentName).join(', ');
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function buildChecks(f: AuditFacts): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const add = (c: Omit<AuditCheck, 'fix'> & { fix?: string }) => checks.push(c.status === 'pass' ? { ...c, fix: undefined } : c);
  const host = (() => {
    try {
      return new URL(f.finalUrl || f.url).hostname;
    } catch {
      return f.url;
    }
  })();
  const reachable = f.homepage.status !== null && f.homepage.status >= 200 && f.homepage.status < 300;
  const unreachableDetail = `Could not analyze — homepage ${f.homepage.status ? `returned HTTP ${f.homepage.status}` : `unreachable (${f.homepage.error ?? 'no response'})`}.`;
  const p = f.page;

  // ---------- crawlability ----------
  add({
    id: 'homepage_reachable', group: 'crawlability', title: 'Homepage reachable', weight: 10,
    status: reachable ? 'pass' : 'fail',
    detail: reachable
      ? `Homepage returned HTTP ${f.homepage.status} in ${f.homepage.ms} ms.`
      : f.homepage.status ? `Homepage returned HTTP ${f.homepage.status}.` : `Homepage unreachable: ${f.homepage.error ?? 'no response'}.`,
    fix: f.homepage.status
      ? 'Serve the homepage with HTTP 200 to crawlers; check WAF / bot-protection rules that challenge non-browser user agents.'
      : `Make sure ${host} resolves and responds quickly over HTTPS — AI crawlers give up on sites that time out.`,
  });
  const https = (f.finalUrl || f.url).startsWith('https://');
  add({
    id: 'https', group: 'crawlability', title: 'Served over HTTPS', weight: 4,
    status: reachable && https ? 'pass' : 'fail',
    detail: !reachable ? unreachableDetail : https ? `Final URL ${f.finalUrl} uses HTTPS.` : `Site is served over plain HTTP (${f.finalUrl}).`,
    fix: 'Serve every page over HTTPS and 301-redirect HTTP to HTTPS.',
  });

  const r = f.robots;
  const rStatus: CheckStatus = r.found ? 'pass' : r.status !== null && r.status >= 500 ? 'fail' : r.error ? 'fail' : 'warn';
  add({
    id: 'robots_txt', group: 'crawlability', title: 'robots.txt', weight: 4, status: rStatus,
    detail: r.found
      ? `robots.txt found with ${plural(r.parsed?.groups.length ?? 0, 'user-agent group')} and ${plural(r.parsed?.sitemaps.length ?? 0, 'Sitemap line')}.`
      : r.servedHtml ? 'robots.txt returns an HTML page (catch-all route), so crawlers ignore it.'
      : r.status !== null && r.status >= 500 ? `robots.txt returned HTTP ${r.status} — crawlers treat server errors as "disallow everything".`
      : r.error ? `robots.txt could not be fetched: ${r.error}.`
      : `No robots.txt (HTTP ${r.status ?? '—'}). Everything is allowed by default, but you can't declare a sitemap or an AI-crawler policy.`,
    fix: 'Serve a plain-text /robots.txt that states your AI-crawler policy explicitly and lists your sitemap.',
  });

  // Agent rules mean something only if robots.txt was read, or the site answered and has none (4xx / HTML catch-all).
  // Otherwise (site down, robots.txt timing out or 5xx/403 to us) the agent checks are "couldn't check", not a pass.
  const robotsKnown = r.found || (reachable && (r.servedHtml || (r.status !== null && r.status >= 400 && r.status < 500 && r.status !== 403)));
  const unknown = {
    status: 'info' as const,
    detail: !reachable
      ? `Couldn't check — site unreachable${f.homepage.error ? ` (${f.homepage.error})` : f.homepage.status ? ` (HTTP ${f.homepage.status})` : ''}.`
      : `Couldn't check — robots.txt ${r.error ? `could not be fetched (${r.error})` : `returned HTTP ${r.status}`}.`,
    fix: 'Make sure the site and /robots.txt respond to crawlers, then run the audit again.',
  };
  const searchAgents = r.agents.filter((a) => a.category === 'search' || a.category === 'user_fetch' || a.category === 'agent');
  const searchBlocked = searchAgents.filter((a) => a.allowed === 'blocked');
  const searchPartial = searchAgents.filter((a) => a.allowed === 'partial');
  add({
    id: 'robots_ai_search', group: 'crawlability', title: 'AI search & user agents allowed', weight: 12,
    status: searchBlocked.length ? 'fail' : searchPartial.length ? 'warn' : 'pass',
    detail: searchBlocked.length
      ? `Blocked in robots.txt: ${names(searchBlocked)}. These agents fetch pages to cite them in AI answers.`
      : searchPartial.length ? `Partially restricted: ${names(searchPartial)} (some sections disallowed).`
      : `All ${searchAgents.length} AI search & user-triggered agents can crawl the site (${searchAgents.filter((a) => a.allowed === 'allowed').length} explicitly allowed).`,
    fix: 'Allow AI search and user-fetch agents (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User) — blocking them removes you from AI answers that browse the web.',
    ...(robotsKnown ? {} : unknown),
  });
  const trainBlocked = r.agents.filter((a) => a.category === 'training' && a.allowed === 'blocked');
  add({
    id: 'robots_ai_training', group: 'crawlability', title: 'AI training crawlers', weight: 3,
    status: trainBlocked.length ? 'warn' : 'pass',
    detail: trainBlocked.length
      ? `Training crawlers blocked: ${names(trainBlocked)}. A legitimate policy choice, but models then learn about ${host} only from third-party sites.`
      : 'Training crawlers are not blocked, so model knowledge can include your own pages.',
    fix: 'Keep the block if it is intentional; otherwise allow these crawlers so models learn your positioning from first-party content.',
    ...(robotsKnown ? {} : unknown),
  });
  const seBlocked = r.agents.filter((a) => a.category === 'search_engine' && a.allowed === 'blocked');
  add({
    id: 'robots_search_engines', group: 'crawlability', title: 'Search engines allowed', weight: 6,
    status: seBlocked.length ? 'fail' : 'pass',
    detail: seBlocked.length
      ? `Blocked: ${names(seBlocked)}. Gemini/AI Overviews build on Google's index; ChatGPT search and Copilot draw on Bing.`
      : 'Googlebot and Bingbot can crawl the site — both indexes feed AI answers.',
    fix: 'Allow Googlebot and Bingbot; use Google-Extended / Applebot-Extended tokens if you only want to opt out of training.',
    ...(robotsKnown ? {} : unknown),
  });

  const xr = f.homepage.xRobotsTag.toLowerCase();
  const noindex = !!p?.noindex || /\b(noindex|none)\b/.test(xr);
  const nosnippet = !!p?.nosnippet || /\bnosnippet\b|max-snippet\s*:\s*0\b/.test(xr);
  add({
    id: 'indexable', group: 'crawlability', title: 'Indexable & quotable', weight: 10,
    status: !reachable ? 'fail' : noindex ? 'fail' : nosnippet || p?.noai ? 'warn' : 'pass',
    detail: !reachable ? unreachableDetail
      : noindex ? `Homepage is marked noindex (${p?.robotsMeta || `X-Robots-Tag: ${f.homepage.xRobotsTag}`}).`
      : nosnippet ? 'Snippets are disabled (nosnippet / max-snippet:0) — AI Overviews and Copilot cannot quote the page.'
      : p?.noai ? 'Page sets a "noai" robots directive.'
      : 'No noindex / nosnippet directives in meta tags or X-Robots-Tag.',
    fix: 'Remove noindex/nosnippet from pages you want cited; restrict only private pages.',
  });

  const sm = f.sitemap;
  add({
    id: 'sitemap', group: 'crawlability', title: 'XML sitemap', weight: 5,
    status: sm.reachable && sm.declared.length ? 'pass' : sm.reachable ? 'warn' : 'fail',
    detail: sm.reachable
      ? `Sitemap reachable at ${sm.url}${sm.urlCount !== null ? ` (${sm.urlCount} URLs)` : ''}${sm.declared.length ? '' : ', but not declared in robots.txt'}.`
      : sm.declared.length ? `Sitemap declared in robots.txt (${sm.declared[0]}) but not reachable.` : 'No sitemap declared in robots.txt and /sitemap.xml not found.',
    fix: 'Publish an XML sitemap of every public page and add a `Sitemap:` line to robots.txt.',
  });

  // ---------- content ----------
  const wc = p?.wordCount ?? 0;
  add({
    id: 'ssr_content', group: 'content', title: 'Server-rendered content', weight: 12,
    status: !p ? 'fail' : wc >= 200 ? 'pass' : wc >= 50 ? 'warn' : 'fail',
    detail: !p ? unreachableDetail
      : wc >= 200 ? `${wc} words of text in the server-rendered HTML.`
      : `Only ${wc} words in the server-rendered HTML${p.spaShell ? ' (empty app shell detected)' : ''} — content may require JavaScript, which most AI crawlers don't execute.`,
    fix: 'Render key content on the server (SSR/SSG or pre-rendering) so crawlers that skip JavaScript see it.',
  });
  const tl = p?.title.length ?? 0;
  add({
    id: 'title', group: 'content', title: 'Title tag', weight: 4,
    status: !p || !tl ? 'fail' : tl < 10 || tl > 70 ? 'warn' : 'pass',
    detail: !p ? unreachableDetail : !tl ? 'No <title> tag.' : `"${p.title}" (${tl} chars${tl > 70 ? ', long' : tl < 10 ? ', short' : ''}).`,
    fix: 'Use a 10–70 character title naming the brand and what it does.',
  });
  const dl = p?.metaDescription.length ?? 0;
  add({
    id: 'meta_description', group: 'content', title: 'Meta description', weight: 4,
    status: !p || !dl ? 'fail' : dl < 50 || dl > 170 ? 'warn' : 'pass',
    detail: !p ? unreachableDetail : !dl ? 'No meta description.' : `${dl} characters: "${p.metaDescription.slice(0, 120)}${dl > 120 ? '…' : ''}"`,
    fix: 'Write a 50–160 character description that states category, audience and key differentiator — AI systems reuse it verbatim.',
  });
  const h1n = p?.h1.length ?? 0;
  add({
    id: 'h1', group: 'content', title: 'H1 heading', weight: 3,
    status: !p || h1n === 0 ? 'fail' : h1n > 1 ? 'warn' : 'pass',
    detail: !p ? unreachableDetail : h1n === 0 ? 'No <h1> in the server-rendered HTML.' : h1n > 1 ? `${h1n} H1 headings: ${p.h1.slice(0, 3).map((h) => `"${h}"`).join(', ')}.` : `"${p.h1[0]}"`,
    fix: 'Use exactly one descriptive H1 per page.',
  });
  add({
    id: 'lang', group: 'content', title: 'Language declared', weight: 2,
    status: p?.lang ? 'pass' : 'warn',
    detail: !p ? unreachableDetail : p.lang ? `<html lang="${p.lang}">` : 'No lang attribute on <html>.',
    fix: 'Add a lang attribute (e.g. <html lang="en">).',
  });
  add({
    id: 'canonical', group: 'content', title: 'Canonical URL', weight: 2,
    status: p?.canonical ? 'pass' : 'warn',
    detail: !p ? unreachableDetail : p.canonical ? `Canonical: ${p.canonical}` : 'No <link rel="canonical">.',
    fix: 'Declare a canonical URL so crawlers consolidate duplicates.',
  });

  // ---------- structured data ----------
  const types = p?.schemaTypes ?? [];
  add({
    id: 'schema_present', group: 'structured_data', title: 'Structured data (JSON-LD)', weight: 5,
    status: !p || !types.length ? 'fail' : p.jsonLdErrors ? 'warn' : 'pass',
    detail: !p ? unreachableDetail
      : !types.length ? `No schema.org markup found${p.jsonLdErrors ? ` (${plural(p.jsonLdErrors, 'JSON-LD block')} failed to parse)` : ''}.`
      : `Types: ${types.slice(0, 10).join(', ')}${p.jsonLdErrors ? `; ${plural(p.jsonLdErrors, 'JSON-LD block')} failed to parse` : ''}.`,
    fix: 'Add JSON-LD describing your organization, product and FAQs.',
  });
  const hasOrg = types.some((t) => ORG_TYPES.includes(t));
  add({
    id: 'schema_organization', group: 'structured_data', title: 'Organization schema', weight: 5,
    status: hasOrg ? 'pass' : 'fail',
    detail: !p ? unreachableDetail : hasOrg ? 'Organization markup present.' : 'No Organization markup — AI systems use it to resolve your name, logo, and official profiles (sameAs).',
    fix: 'Add Organization JSON-LD with name, url, logo, description and sameAs links.',
  });
  const hasProduct = types.some((t) => PRODUCT_TYPES.includes(t));
  add({
    id: 'schema_product', group: 'structured_data', title: 'Product / SoftwareApplication schema', weight: 4,
    status: hasProduct ? 'pass' : 'warn',
    detail: !p ? unreachableDetail : hasProduct ? `Product markup present (${types.filter((t) => PRODUCT_TYPES.includes(t)).join(', ')}).` : 'No Product/SoftwareApplication markup describing what you sell.',
    fix: 'Add Product or SoftwareApplication JSON-LD with category, offers/pricing and aggregateRating where applicable.',
  });
  const hasFaq = types.includes('FAQPage');
  add({
    id: 'schema_faq', group: 'structured_data', title: 'FAQPage schema', weight: 3,
    status: hasFaq ? 'pass' : 'warn',
    detail: !p ? unreachableDetail : hasFaq ? 'FAQPage markup present.' : 'No FAQPage markup — question/answer content is among the formats AI answers quote most.',
    fix: 'Publish an FAQ answering buyer questions and mark it up as FAQPage.',
  });
  const og = p?.ogTags ?? {};
  const ogCore = ['og:title', 'og:description', 'og:image'].filter((k) => og[k]);
  add({
    id: 'opengraph', group: 'structured_data', title: 'OpenGraph tags', weight: 2,
    status: ogCore.length === 3 ? 'pass' : ogCore.length ? 'warn' : 'fail',
    detail: !p ? unreachableDetail : ogCore.length === 3 ? 'og:title, og:description and og:image present.' : `Missing: ${['og:title', 'og:description', 'og:image'].filter((k) => !og[k]).join(', ')}.`,
    fix: 'Add og:title, og:description and og:image.',
  });

  // ---------- AI files ----------
  const l = f.llms;
  add({
    id: 'llms_txt', group: 'ai_files', title: 'llms.txt', weight: 8,
    status: l.found && l.hasTitle ? 'pass' : l.found ? 'warn' : 'fail',
    detail: l.found
      ? `${l.url} found (${kb(l.bytes)}, ${plural(l.links, 'link')})${l.hasTitle ? '' : ' but it does not start with a "# Title" line as llmstxt.org specifies'}.`
      : l.servedHtml ? `${l.url} returns an HTML page instead of a markdown file.` : `No llms.txt at ${l.url} (HTTP ${l.status ?? '—'}).`,
    fix: 'Publish /llms.txt (llmstxt.org): "# Site name", a "> one-line summary", then "## Sections" listing key pages as markdown links.',
  });
  add({
    id: 'llms_full_txt', group: 'ai_files', title: 'llms-full.txt', weight: 1,
    status: f.llmsFull.found ? 'pass' : 'info',
    detail: f.llmsFull.found ? `llms-full.txt found (${kb(f.llmsFull.bytes)}).` : 'No llms-full.txt (optional: full docs content in one markdown file).',
    fix: 'Optionally publish /llms-full.txt with the full text of your docs.',
  });

  // ---------- performance ----------
  const ms = f.homepage.ms ?? 0;
  add({
    id: 'response_time', group: 'performance', title: 'Response time', weight: 4,
    status: !reachable ? 'fail' : ms < 1000 ? 'pass' : ms < 3000 ? 'warn' : 'fail',
    detail: !reachable ? unreachableDetail : `Homepage HTML downloaded in ${ms} ms.`,
    fix: 'Keep HTML responses under ~1 s (caching/CDN); AI user-fetchers work under tight time budgets.',
  });
  add({
    id: 'html_size', group: 'performance', title: 'HTML size', weight: 2,
    status: !reachable ? 'fail' : f.homepage.truncated || f.homepage.bytes > 3 * 1024 * 1024 ? 'fail' : f.homepage.bytes > 1024 * 1024 ? 'warn' : 'pass',
    detail: !reachable ? unreachableDetail : `HTML is ${kb(f.homepage.bytes)}${f.homepage.truncated ? ' (truncated at the audit limit)' : ''}.`,
    fix: 'Keep HTML under 1 MB; inline data blobs push content past crawler size limits.',
  });

  return checks;
}

const FACTOR: Record<CheckStatus, number | null> = { pass: 1, warn: 0.5, fail: 0, info: null };

/**
 * Gating caps: a site AI can't reach, index or fetch isn't "AI-ready" however polished the rest is.
 * Unreachable homepage ≤ 35, noindex ≤ 45, half or more of AI search/user agents blocked ≤ 55.
 */
export function scoreCap(f: AuditFacts): { cap: number; reason: string } | null {
  const caps: { cap: number; reason: string }[] = [];
  if (f.homepage.status === null || f.homepage.status >= 400) {
    caps.push({ cap: 35, reason: f.homepage.status ? `the homepage returns HTTP ${f.homepage.status} to crawlers` : 'the homepage is unreachable' });
  }
  if (f.page?.noindex || /\b(noindex|none)\b/i.test(f.homepage.xRobotsTag)) caps.push({ cap: 45, reason: 'the homepage is marked noindex' });
  const search = f.robots.agents.filter((a) => a.category === 'search' || a.category === 'user_fetch' || a.category === 'agent');
  const blocked = search.filter((a) => a.allowed === 'blocked').length;
  if (search.length && blocked / search.length >= 0.5) caps.push({ cap: 55, reason: `robots.txt blocks ${blocked} of ${search.length} AI search & user agents` });
  return caps.sort((a, b) => a.cap - b.cap)[0] ?? null;
}

/** Weighted score 0..100 ('info' checks don't count), limited by `cap`. */
export function scoreChecks(checks: AuditCheck[], cap = 100): number {
  let total = 0;
  let got = 0;
  for (const c of checks) {
    const f = FACTOR[c.status];
    if (f === null) continue;
    total += c.weight;
    got += c.weight * f;
  }
  return Math.min(cap, total ? Math.round((got / total) * 100) : 0);
}
