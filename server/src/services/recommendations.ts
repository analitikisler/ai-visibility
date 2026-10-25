// Plan: rule-based, prioritized recommendations with stable keys. User status lives in recommendation_state.
import { all, nowIso, run } from '../db/index.ts';
import { missedPages, rangeFor } from '../crawlers/overview.ts';
import type { EngineId, Project, Recommendation, RecStatus } from '../../../shared/types.ts';
import { computeDiagnosis, ENGINE_NAMES, entityStats, negativeThemes, num, pct, plural, type DiagnosisContext } from './diagnose.ts';

type Rec = Omit<Recommendation, 'status'>;

const ENGINE_ADVICE: Record<EngineId, { category: Rec['category']; advice: string }> = {
  chatgpt: { category: 'technical', advice: 'ChatGPT search pulls web results largely from Bing. Verify the site in Bing Webmaster Tools, submit your sitemap, enable IndexNow so new pages are picked up fast, and keep OAI-SearchBot and ChatGPT-User allowed in robots.txt.' },
  gemini: { category: 'technical', advice: 'Gemini and Google AI Overviews build on Google Search. Check index coverage in Google Search Console, fix excluded pages, add structured data, and earn mentions on the sources Google ranks for your category. (Google-Extended only controls training, not Search.)' },
  perplexity: { category: 'content', advice: 'Perplexity favors fresh, well-cited pages. Update key pages with dates, concrete numbers and outbound citations, publish comparison and "best X" content, keep PerplexityBot/Perplexity-User allowed, and get covered by the sources Perplexity cites.' },
  claude: { category: 'technical', advice: "Claude's web search relies on Brave Search. Make sure your key pages appear in Brave (search.brave.com), allow Claude-SearchBot and Claude-User in robots.txt, and publish clear, factual pages Claude can quote." },
  grok: { category: 'sources', advice: 'Grok leans on X (Twitter) posts and live web results. Publish product news, comparisons and customer proof on X from the company and team accounts, and keep pages crawlable.' },
  deepseek: { category: 'sources', advice: 'DeepSeek answers mostly from training data. Make sure your positioning is repeated consistently on widely crawled third-party sites (reviews, wikis, forums) and that training crawlers like CCBot can read your own pages.' },
};

const REVIEW_SITES = ['g2.com', 'capterra.com', 'trustpilot.com', 'getapp.com', 'softwareadvice.com', 'trustradius.com', 'gartner.com', 'producthunt.com'];
const COMMUNITY_SITES = ['reddit.com', 'quora.com', 'stackoverflow.com', 'news.ycombinator.com', 'stackexchange.com'];
const SKIP_OUTREACH = ['wikipedia.org', 'wikidata.org'];
const VIDEO_SITES = ['youtube.com', 'vimeo.com'];

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'general';
const quote = (s: string, n = 90) => `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"`;
const capPriority = (x: number, max = 99) => Math.max(1, Math.min(max, Math.round(x)));

function contentRules(ctx: DiagnosisContext, out: Rec[]): void {
  const { data, brand, competitors, diagnosis } = ctx;
  const B = data.project.name;
  const respById = new Map(data.responses.map((r) => [r.id, r]));

  // 1) Lost prompts → comparison page per winning competitor.
  const byWinner = new Map<string, typeof diagnosis.lostPrompts>();
  for (const lp of diagnosis.lostPrompts) byWinner.set(lp.winner, [...(byWinner.get(lp.winner) ?? []), lp]);
  for (const [winner, lost] of byWinner) {
    const comp = data.project.competitors.find((c) => c.name === winner);
    const cStats = competitors.find((c) => c.stats.entity.name === winner);
    if (!comp) continue;
    const mustWin = lost.some((l) => data.prompts.get(l.promptId)?.tier === 'must_win');
    out.push({
      key: `compare:${comp.id}`,
      title: `Publish a ${B} vs ${winner} comparison page`,
      description: `${winner} wins ${plural(lost.length, 'prompt')} where ${B} is barely mentioned. A fair, specific comparison page (ideal customer, pricing, features, migration) gives AI assistants a first-party source to cite when people compare the two.`,
      category: 'content', impact: 'high', effort: 'medium',
      priority: capPriority(62 + 6 * Math.min(lost.length, 4) + (mustWin ? 10 : 0), 95),
      driver: 'content_coverage',
      evidence: [
        ...lost.slice(0, 3).map((l) => `${quote(l.text)} — ${winner} ${pct(l.winnerVisibility)} vs ${B} ${pct(l.brandVisibility)}`),
        ...(cStats ? [`Overall visibility (last ${data.days} days): ${winner} ${pct(cStats.stats.visibility)} vs ${B} ${pct(brand.stats.visibility)}`] : []),
      ],
      relatedPromptIds: lost.map((l) => l.promptId),
      draft: { kind: 'comparison_page', params: { competitorId: comp.id, promptIds: lost.map((l) => l.promptId).join(',') } },
    });
  }

  // 2) High-share third-party domains that cite competitors but rarely the brand → get featured.
  const dom = new Map<string, { resp: number; brand: number; comp: Map<string, number>; prompts: Map<string, number>; cites: number }>();
  let totalCites = 0;
  for (const r of data.responses) {
    const cites = data.citations.get(r.id) ?? [];
    totalCites += cites.length;
    const mentionedKeys = new Set((data.mentions.get(r.id) ?? []).map((m) => m.key));
    for (const c of cites) {
      if (c.sourceType !== 'third_party') continue;
      const d = dom.get(c.domain) ?? { resp: 0, brand: 0, comp: new Map(), prompts: new Map(), cites: 0 };
      d.cites++;
      dom.set(c.domain, d);
    }
    for (const domain of new Set(cites.filter((c) => c.sourceType === 'third_party').map((c) => c.domain))) {
      const d = dom.get(domain)!;
      d.resp++;
      d.prompts.set(r.promptId, (d.prompts.get(r.promptId) ?? 0) + 1);
      if (mentionedKeys.has('brand')) d.brand++;
      for (const k of mentionedKeys) if (k !== 'brand') d.comp.set(k, (d.comp.get(k) ?? 0) + 1);
    }
  }
  // Relative test: the domain under-indexes for the brand and a competitor clearly out-appears it there.
  const outreach = [...dom.entries()]
    .filter(([domain]) => !SKIP_OUTREACH.some((s) => domain.endsWith(s)))
    .map(([domain, d]) => {
      const [bestKey, bestN] = [...d.comp.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
      const brandRate = d.resp ? d.brand / d.resp : 0;
      const bestRate = d.resp ? bestN / d.resp : 0;
      return { domain, d, share: totalCites ? d.cites / totalCites : 0, brandRate, bestKey, bestRate, gap: bestRate - brandRate };
    })
    .filter((x) => x.share >= 0.03 && x.d.resp >= 5 && x.brandRate < brand.stats.visibility && x.gap >= 0.05)
    .sort((a, b) => b.share * b.gap - a.share * a.gap)
    .slice(0, 3);
  for (const o of outreach) {
    const cName = data.entities.find((e) => e.key === o.bestKey)?.name ?? 'competitors';
    const topPrompts = [...o.d.prompts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pid]) => pid);
    const review = REVIEW_SITES.some((s) => o.domain.endsWith(s));
    const community = COMMUNITY_SITES.some((s) => o.domain.endsWith(s));
    const video = VIDEO_SITES.some((s) => o.domain.endsWith(s));
    out.push({
      key: `outreach:${o.domain}`,
      title: review ? `Strengthen ${B}'s presence on ${o.domain}` : community ? `Join the conversations on ${o.domain}` : video ? `Get ${B} covered in ${o.domain} reviews` : `Get ${B} featured on ${o.domain}`,
      description: `${o.domain} accounts for ${pct(o.share)} of all citations in AI answers, and those answers mention ${cName} more often than ${B} (${pct(o.bestRate)} vs ${pct(o.brandRate)}). ${
        review ? `Claim and complete your profile, refresh screenshots and pricing, and run a review campaign so AI answers that lean on ${o.domain} include ${B}.`
        : community ? `Have team members answer relevant threads transparently (disclosing affiliation) — AI assistants quote these discussions directly.`
        : video ? `Publish or sponsor walkthroughs and comparison videos — transcripts are cited in AI answers.`
        : `Pitch an inclusion in their roundups/comparisons or an update to existing articles so answers that rely on it mention ${B}.`}`,
      category: 'sources', impact: o.share >= 0.06 ? 'high' : 'medium', effort: 'medium',
      priority: capPriority(50 + o.share * 300 + o.gap * 60, 88),
      driver: 'source_authority',
      evidence: [
        `Cited in ${plural(o.d.resp, 'answer')} (${pct(o.share)} of all citations)`,
        `${B} appears in ${pct(o.brandRate)} of those answers (${pct(brand.stats.visibility)} across all answers); ${cName} in ${pct(o.bestRate)}`,
        `Cited for: ${topPrompts.map((pid) => quote(data.prompts.get(pid)?.text ?? '', 60)).join(', ')}`,
      ],
      relatedPromptIds: topPrompts,
      draft: community || video ? undefined : { kind: 'outreach_email', params: { domain: o.domain } },
    });
  }

  // 3) Weakest engine with engine-specific advice.
  const engines = [...new Set(data.responses.map((r) => r.engine))]
    .map((e) => ({ e, s: entityStats(data, data.entities[0]!, data.responses.filter((r) => r.engine === e)) }))
    .filter((x) => x.s.responses >= 8)
    .sort((a, b) => a.s.visibility - b.s.visibility);
  const weakest = engines[0];
  const best = engines[engines.length - 1];
  if (weakest && best && best.s.visibility - weakest.s.visibility >= 0.1) {
    const advice = ENGINE_ADVICE[weakest.e];
    const neverOn = [...weakest.s.promptVis.entries()].filter(([, v]) => v.n > 0 && v.m === 0).map(([pid]) => pid);
    out.push({
      key: `engine:${weakest.e}`,
      title: `Improve visibility on ${ENGINE_NAMES[weakest.e]}`,
      description: advice.advice,
      category: advice.category, impact: 'medium', effort: 'medium',
      priority: capPriority(50 + (best.s.visibility - weakest.s.visibility) * 60, 80),
      driver: 'content_coverage',
      evidence: [
        `${ENGINE_NAMES[weakest.e]} mentions ${B} in ${pct(weakest.s.visibility)} of answers vs ${pct(best.s.visibility)} on ${ENGINE_NAMES[best.e]}`,
        ...(neverOn.length ? [`${plural(neverOn.length, 'prompt')} where ${ENGINE_NAMES[weakest.e]} never mentions ${B}, e.g. ${quote(data.prompts.get(neverOn[0]!)?.text ?? '', 70)}`] : []),
      ],
      relatedPromptIds: neverOn.slice(0, 10),
    });
  }

  // 4) Negative sentiment themes → reputation work.
  const s = brand.sent;
  const negShare = s.mentions ? s.negative / s.mentions : 0;
  if (s.mentions >= 5 && s.negative >= 3 && (negShare >= 0.12 || s.score < 50)) {
    const themes = negativeThemes(brand.stats.rows).slice(0, 3);
    const negRows = brand.stats.rows.filter((r) => r.label === 'negative' || r.sentiment <= -0.25);
    const negIds = negRows.map((r) => respById.get(r.responseId)?.promptId).filter((x): x is string => !!x);
    out.push({
      key: 'reputation',
      title: themes.length ? `Address what AI answers criticize: ${themes.map((t) => t.theme).join(', ')}` : `Reduce negative mentions of ${B}`,
      description: `${pct(negShare)} of ${B}'s mentions are negative. AI assistants repeat what reviews and forums say — fix the underlying issue where you can, publish clear first-party answers (pricing page, changelog, support SLAs), and respond to reviews on the sites being cited.`,
      category: 'reputation', impact: negShare >= 0.2 ? 'high' : 'medium', effort: 'high',
      priority: capPriority(45 + negShare * 150, 82),
      driver: 'sentiment',
      evidence: [
        `${num(s.negative)} of ${plural(s.mentions, 'mention')} negative (${pct(negShare)}); sentiment ${s.score}/100`,
        ...(themes.length ? [`Themes: ${themes.map((t) => `${t.theme} (${num(t.count)})`).join(', ')}`] : []),
        ...negRows.slice(0, 2).map((r) => `Example: ${quote(r.context, 140)}`),
      ],
      relatedPromptIds: [...new Set(negIds)].slice(0, 10),
    });
  }

  // 5) How-to prompts with low visibility → FAQ page.
  const howTo = [...brand.stats.promptVis.entries()]
    .filter(([pid, v]) => data.prompts.get(pid)?.intent === 'how_to' && v.n > 0 && v.m / v.n < 0.3)
    .sort((a, b) => a[1].m / a[1].n - b[1].m / b[1].n);
  if (howTo.length) {
    out.push({
      key: 'faq-how-to',
      title: 'Publish an FAQ that answers how-to questions',
      description: `${B} is rarely part of answers to practical "how do I…" questions. A server-rendered FAQ with direct 2–4 sentence answers (and FAQPage schema) is one of the formats AI assistants quote most.`,
      category: 'content', impact: 'medium', effort: 'low',
      priority: capPriority(55 + 3 * howTo.length, 75),
      driver: 'content_coverage',
      evidence: howTo.slice(0, 3).map(([pid, v]) => `${quote(data.prompts.get(pid)?.text ?? '')} — ${B} visible in ${pct(v.m / v.n)}`),
      relatedPromptIds: howTo.map(([pid]) => pid),
      draft: { kind: 'faq_page', params: { promptIds: howTo.map(([pid]) => pid).join(',') } },
    });
  }

  // 6) Lowest-visibility topic → content brief.
  const topics = new Map<string, { n: number; m: number; prompts: string[] }>();
  for (const [pid, v] of brand.stats.promptVis) {
    const t = data.prompts.get(pid)?.topic || 'General';
    const cur = topics.get(t) ?? { n: 0, m: 0, prompts: [] };
    topics.set(t, { n: cur.n + v.n, m: cur.m + v.m, prompts: [...cur.prompts, pid] });
  }
  const weakTopic = [...topics.entries()].filter(([, v]) => v.n >= 4).sort((a, b) => a[1].m / a[1].n - b[1].m / b[1].n)[0];
  if (weakTopic && weakTopic[1].m / weakTopic[1].n < 0.5) {
    const [topic, v] = weakTopic;
    const vis = v.m / v.n;
    const leader = competitors
      .map((c) => {
        let n = 0;
        let m = 0;
        for (const pid of v.prompts) {
          const cv = c.stats.promptVis.get(pid);
          if (cv) (n += cv.n), (m += cv.m);
        }
        return { name: c.stats.entity.name, vis: n ? m / n : 0 };
      })
      .sort((a, b) => b.vis - a.vis)[0];
    out.push({
      key: `brief:${slug(topic)}`,
      title: `Create content for "${topic}"`,
      description: `"${topic}" is ${B}'s weakest topic in AI answers. A focused guide with a clear definition, comparison table, concrete numbers and an FAQ gives assistants something specific to cite.`,
      category: 'content', impact: vis < 0.2 ? 'high' : 'medium', effort: 'medium',
      priority: capPriority(52 + (0.5 - vis) * 40, 78),
      driver: 'content_coverage',
      evidence: [
        `${B} visible in ${pct(vis)} of "${topic}" answers (${plural(v.prompts.length, 'prompt')})${leader ? ` vs ${leader.name} ${pct(leader.vis)}` : ''}`,
        ...v.prompts.slice(0, 2).map((pid) => `Prompt: ${quote(data.prompts.get(pid)?.text ?? '')}`),
      ],
      relatedPromptIds: v.prompts,
      draft: { kind: 'content_brief', params: { topic } },
    });
  }
}

function technicalRules(ctx: DiagnosisContext, project: Project, out: Rec[]): void {
  const audit = ctx.tech.audit;
  const B = project.name;
  if (!audit) {
    out.push({
      key: 'run-audit', title: 'Run an AI-readiness audit',
      description: `Check ${project.domain}'s robots.txt AI rules, llms.txt, structured data and server-rendered content to see what AI crawlers can actually read.`,
      category: 'technical', impact: 'medium', effort: 'low', priority: 72, driver: 'technical_readiness',
      evidence: ['No audit has been run for this site yet'], relatedPromptIds: [],
    });
    return;
  }
  const check = (id: string) => audit.checks.find((c) => c.id === id);
  const failing = (id: string) => {
    const c = check(id);
    return c && (c.status === 'fail' || c.status === 'warn') ? c : null;
  };

  const indexable = check('indexable');
  if (indexable?.status === 'fail' && audit.page.statusCode) {
    out.push({
      key: 'indexable', title: 'Remove noindex from pages you want cited',
      description: 'The homepage tells crawlers not to index it. Search engines and AI search indexes drop noindexed pages, so they can never be cited.',
      category: 'technical', impact: 'high', effort: 'low', priority: 97, driver: 'technical_readiness',
      evidence: [indexable.detail], relatedPromptIds: [],
    });
  }

  const search = audit.robots.agents.filter((a) => a.category === 'search' || a.category === 'user_fetch' || a.category === 'agent');
  const blocked = search.filter((a) => a.allowed === 'blocked');
  const partial = search.filter((a) => a.allowed === 'partial');
  if (blocked.length || partial.length) {
    const list = (blocked.length ? blocked : partial).map((a) => a.agentName);
    out.push({
      key: 'robots-ai-access',
      title: blocked.length ? `Unblock ${list.slice(0, 3).join(', ')}${list.length > 3 ? ` +${list.length - 3}` : ''} in robots.txt` : 'Open your content to AI search agents',
      description: 'These agents fetch pages to cite and link them in AI answers (they are not training crawlers). Blocking them removes your pages from those answers. Allow them explicitly and keep training crawlers as a separate, deliberate choice.',
      category: 'crawlers', impact: 'high', effort: 'low', priority: blocked.length ? 92 : 70, driver: 'technical_readiness',
      evidence: [
        ...(blocked.length ? [`Blocked: ${blocked.map((a) => `${a.agentName} (${a.operator})`).join(', ')}`] : []),
        ...(partial.length ? [`Partially restricted: ${partial.map((a) => a.agentName).join(', ')}`] : []),
      ],
      relatedPromptIds: [],
      draft: { kind: 'robots_txt', params: {} },
    });
  }

  const llms = failing('llms_txt');
  if (llms) {
    out.push({
      key: 'llms-txt', title: llms.status === 'fail' ? 'Publish an llms.txt file' : 'Fix your llms.txt format',
      description: `An llms.txt (llmstxt.org) gives AI agents a curated, markdown map of ${B}'s most important pages — product, pricing, docs and comparisons — so they don't have to guess from navigation.`,
      category: 'technical', impact: 'medium', effort: 'low', priority: 64, driver: 'technical_readiness',
      evidence: [llms.detail], relatedPromptIds: [],
      draft: { kind: 'llms_txt', params: {} },
    });
  }

  const missingSchema = [
    ['schema_organization', 'Organization'],
    ['schema_product', 'SoftwareApplication'],
    ['schema_faq', 'FAQPage'],
  ].filter(([id]) => failing(id!)).map(([, t]) => t!);
  if (missingSchema.length) {
    out.push({
      key: 'schema-jsonld', title: `Add ${missingSchema.join(', ')} structured data`,
      description: 'JSON-LD tells AI systems unambiguously who you are, what you sell and which questions you answer — it is used for entity resolution and quoted in answers.',
      category: 'technical', impact: 'medium', effort: 'low', priority: capPriority(52 + 6 * missingSchema.length), driver: 'technical_readiness',
      evidence: [`Found: ${audit.page.schemaTypes.join(', ') || 'no schema.org types'}`, `Missing: ${missingSchema.join(', ')}`],
      relatedPromptIds: [],
      draft: { kind: 'schema_jsonld', params: { types: ['Organization', 'WebSite', ...missingSchema].filter((t, i, a) => a.indexOf(t) === i).join(',') } },
    });
  }

  const ssr = failing('ssr_content');
  if (ssr && audit.page.statusCode) {
    out.push({
      key: 'ssr-content', title: 'Server-render your key content',
      description: 'Most AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not execute JavaScript. Content that only appears after client-side rendering is invisible to them — use SSR/SSG or pre-rendering for marketing, pricing and docs pages.',
      category: 'technical', impact: 'high', effort: 'high', priority: ssr.status === 'fail' ? 80 : 60, driver: 'technical_readiness',
      evidence: [ssr.detail], relatedPromptIds: [],
    });
  }

  const sitemap = failing('sitemap');
  if (sitemap) {
    out.push({
      key: 'sitemap', title: sitemap.status === 'fail' ? 'Publish an XML sitemap' : 'Declare your sitemap in robots.txt',
      description: 'A complete sitemap with lastmod dates helps AI search indexes discover new and updated pages quickly.',
      category: 'technical', impact: 'medium', effort: 'low', priority: 46, driver: 'technical_readiness',
      evidence: [sitemap.detail], relatedPromptIds: [],
    });
  }

  const meta = [failing('title'), failing('meta_description')].filter((c) => !!c);
  if (meta.length && audit.page.statusCode) {
    out.push({
      key: 'meta-tags', title: 'Tighten title and meta description',
      description: `AI systems often reuse the title and meta description verbatim to describe ${B}. State the category, audience and key differentiator plainly.`,
      category: 'content', impact: 'low', effort: 'low', priority: 38, driver: 'content_quality',
      evidence: meta.map((c) => `${c.title}: ${c.detail}`), relatedPromptIds: [],
    });
  }
}

async function crawlerRules(ctx: DiagnosisContext, project: Project, out: Rec[]): Promise<void> {
  if (!ctx.tech.tracking) {
    if (!project.isDemo) {
      out.push({
        key: 'install-tracking', title: 'Install AI crawler tracking',
        description: 'See which AI agents (GPTBot, ClaudeBot, PerplexityBot, ChatGPT-User…) read which pages, and which important pages they miss. Add the middleware, Worker or log-shipping snippet from Integrations.',
        category: 'crawlers', impact: 'medium', effort: 'low', priority: 42, driver: 'technical_readiness',
        evidence: ['No crawler events received yet'], relatedPromptIds: [],
      });
    }
    return;
  }
  // Deliberately fixed at 30 days (labelled so in the copy): a week is too short to call a page "never read".
  const missed = await missedPages(project, rangeFor(30));
  if (missed.length >= 3) {
    out.push({
      key: 'crawl-missed-pages', title: `Get ${num(missed.length)}${missed.length >= 50 ? '+' : ''} important ${missed.length === 1 ? 'page' : 'pages'} read by AI crawlers`,
      description: `These pages ${missed[0]?.source === 'sitemap' ? 'are in your sitemap' : 'exist (search engines fetch them)'} but no AI agent requested them in the last 30 days. Link to them from high-traffic pages (home, pricing, docs navigation), keep them in sitemap.xml with lastmod dates, and list them in llms.txt.`,
      category: 'crawlers', impact: 'medium', effort: 'low', priority: capPriority(48 + Math.min(20, missed.length * 2)), driver: 'technical_readiness',
      evidence: [`Not fetched by any AI agent in the last 30 days: ${missed.slice(0, 5).map((m) => m.path).join(', ')}${missed.length > 5 ? ` and ${num(missed.length - 5)} more` : ''}`],
      relatedPromptIds: [],
      draft: { kind: 'llms_txt', params: {} },
    });
  }
}

const STATUS_ORDER: Record<RecStatus, number> = { in_progress: 0, open: 1, done: 2, dismissed: 3 };

/** All recommendations for a project, with stored statuses, sorted (active first, then by priority). */
export async function listRecommendations(project: Project, ctx: DiagnosisContext = computeDiagnosis(project)): Promise<Recommendation[]> {
  const recs: Rec[] = [];
  if (!ctx.data.responses.length) {
    recs.push({
      key: 'run-monitoring', title: 'Run your first check',
      description: 'Collect AI answers for your tracked prompts so visibility, competitors and sources can be measured.',
      category: 'content', impact: 'high', effort: 'low', priority: 90, driver: 'content_coverage',
      evidence: [`No AI answers collected in the last ${ctx.data.days} days`], relatedPromptIds: [],
    });
  }
  contentRules(ctx, recs);
  technicalRules(ctx, project, recs);
  await crawlerRules(ctx, project, recs);

  const states = new Map(
    all<{ rec_key: string; status: RecStatus }>('SELECT rec_key, status FROM recommendation_state WHERE project_id = ?', [project.id]).map((s) => [s.rec_key, s.status]),
  );
  return recs
    .map((r) => ({ ...r, status: states.get(r.key) ?? 'open' }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.priority - a.priority || a.key.localeCompare(b.key));
}

/** Sets a recommendation's status; returns the updated recommendation or null if the key doesn't exist. */
export async function setRecommendationStatus(project: Project, key: string, status: RecStatus, days = 30): Promise<Recommendation | null> {
  const rec = (await listRecommendations(project, computeDiagnosis(project, days))).find((r) => r.key === key);
  if (!rec) return null;
  run(
    `INSERT INTO recommendation_state (project_id, rec_key, status, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, rec_key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    [project.id, key, status, nowIso()],
  );
  return { ...rec, status };
}

/** Moves an open (or never-touched) recommendation to in_progress — called when its draft is generated. */
export function markRecommendationInProgress(projectId: string, key: string): void {
  run(
    `INSERT INTO recommendation_state (project_id, rec_key, status, updated_at) VALUES (?, ?, 'in_progress', ?)
     ON CONFLICT(project_id, rec_key) DO UPDATE SET status = 'in_progress', updated_at = excluded.updated_at
     WHERE recommendation_state.status = 'open'`,
    [projectId, key, nowIso()],
  );
}
