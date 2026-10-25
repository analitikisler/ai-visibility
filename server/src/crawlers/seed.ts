// Synthetic, realistic AI-crawler + AI-referral traffic for demo projects (deterministic per project id).
import { createHash } from 'node:crypto';
import { db, tx } from '../db/index.ts';
import { getProject } from '../services/projects.ts';
import { agentById, classifyAgent, classifyReferrer } from './catalog.ts';
import { loadedPrefixes, SPOOFED, UNVERIFIED, VERIFIED, verifyIp } from './verify.ts';
import type { AgentCategory } from '../../../shared/types.ts';

type Section = 'home' | 'pricing' | 'features' | 'blog' | 'docs' | 'compare' | 'integrations' | 'company' | 'meta' | 'llms' | 'missed' | 'errors';
type Mix = Partial<Record<Section, number>>;

interface SeedAgent {
  id: string; name: string; operator: string; category: AgentCategory; ua: string;
  ips: string[];         // IPv4 CIDRs: a snapshot of the operator's published ranges (Oct 2026) when it has a list
  spoof?: number;        // share of hits from residential IPs that only claim to be this agent
  base: number;          // events/day at the start of the period
  growth: number;        // relative growth by the end of the period
  weekday?: [number, number]; // [weekday factor, weekend factor]
  burst?: [number, number, number]; // [probability, burst factor, normal factor]
  mix: Mix;
  firstDaysAgo?: number; // "new agent": first appears this many days ago
}

const TRAINING: Mix = { blog: 0.34, docs: 0.24, features: 0.12, compare: 0.05, integrations: 0.08, company: 0.07, home: 0.03, pricing: 0.03, meta: 0.02, llms: 0.01, errors: 0.01 };
const SEARCH: Mix = { blog: 0.26, compare: 0.15, pricing: 0.1, features: 0.18, docs: 0.1, integrations: 0.09, home: 0.05, company: 0.04, meta: 0.02, llms: 0.01 };
const USER: Mix = { pricing: 0.22, compare: 0.2, blog: 0.25, docs: 0.14, features: 0.1, integrations: 0.05, home: 0.04 };
const ENGINE: Mix = { blog: 0.24, docs: 0.18, features: 0.12, compare: 0.05, integrations: 0.08, company: 0.08, home: 0.06, pricing: 0.04, meta: 0.04, missed: 0.08, errors: 0.03 };
const SEO: Mix = { blog: 0.3, compare: 0.1, features: 0.15, company: 0.15, home: 0.1, pricing: 0.05, missed: 0.05, errors: 0.1 };

// Real prefixes from each operator's published list (Oct 2026). Seeded IPs come from the loaded lists when
// verify.ts has them, else from these, so demo hits verify the same way live hits do.
const OPENAI_GPTBOT = ['20.171.206.0/24', '20.171.207.0/24', '52.230.152.0/24', '132.196.86.0/24'];
const OPENAI_SEARCH = ['104.210.140.128/28', '135.234.64.0/24', '172.182.193.224/28'];
const OPENAI_USER = ['104.208.184.192/28', '104.210.139.192/28', '13.65.138.112/28', '13.67.72.16/28'];
const ANTHROPIC = ['216.73.216.0/22'];
const PERPLEXITY_BOT = ['18.97.1.228/30', '18.97.9.96/29', '107.20.236.150/32', '3.224.62.45/32'];
const PERPLEXITY_USER = ['18.97.21.0/30', '18.97.43.80/29', '44.208.221.197/32'];
const GOOGLE_COMMON = ['66.249.64.0/27', '66.249.64.32/27', '66.249.64.64/27'];
const BING = ['157.55.39.0/24', '207.46.13.0/24', '40.77.167.0/24'];
const APPLE = ['17.241.208.160/27', '17.241.193.160/27', '17.166.192.48/28'];
const CCBOT = ['18.97.9.168/29', '18.97.14.80/29'];
const AHREFS = ['5.39.1.224/27', '15.235.27.0/24'];
/** Consumer ISP blocks (cable/DSL in the US, UK, DE, FR): where scrapers posing as GPTBot or ClaudeBot come from. */
const RESIDENTIAL = ['73.162.0.0/16', '98.207.0.0/16', '24.130.0.0/16', '86.143.0.0/16', '79.211.0.0/16', '90.114.0.0/16'];

const WEB = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko';
const AGENTS: SeedAgent[] = [
  { id: 'gptbot', name: 'GPTBot', operator: 'OpenAI', category: 'training', ua: `${WEB}); compatible; GPTBot/1.3; +https://openai.com/gptbot`, ips: OPENAI_GPTBOT, spoof: 0.04, base: 120, growth: 0.1, mix: TRAINING },
  { id: 'claudebot', name: 'ClaudeBot', operator: 'Anthropic', category: 'training', ua: `${WEB}; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)`, ips: ANTHROPIC, spoof: 0.06, base: 40, growth: 0, mix: TRAINING },
  { id: 'oai-searchbot', name: 'OAI-SearchBot', operator: 'OpenAI', category: 'search', ua: `${WEB}); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot`, ips: OPENAI_SEARCH, base: 30, growth: 0.4, weekday: [1.05, 0.9], mix: SEARCH },
  { id: 'perplexitybot', name: 'PerplexityBot', operator: 'Perplexity', category: 'search', ua: `${WEB}; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)`, ips: PERPLEXITY_BOT, base: 24, growth: 0.35, weekday: [1.05, 0.9], mix: SEARCH },
  { id: 'chatgpt-user', name: 'ChatGPT-User', operator: 'OpenAI', category: 'user_fetch', ua: `${WEB}); compatible; ChatGPT-User/1.0; +https://openai.com/bot`, ips: OPENAI_USER, base: 32, growth: 0.5, weekday: [1.6, 0.45], burst: [0.15, 1.8, 1], mix: USER },
  { id: 'perplexity-user', name: 'Perplexity-User', operator: 'Perplexity', category: 'user_fetch', ua: `${WEB}; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)`, ips: PERPLEXITY_USER, base: 12, growth: 0.4, weekday: [1.4, 0.5], mix: USER },
  { id: 'meta-externalagent', name: 'Meta-ExternalAgent', operator: 'Meta', category: 'training', ua: 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', ips: ['57.141.0.0/24'], base: 28, growth: 0.2, burst: [0.1, 2.5, 0.9], mix: TRAINING },
  { id: 'bytespider', name: 'Bytespider', operator: 'ByteDance', category: 'training', ua: 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)', ips: ['47.128.36.0/24'], base: 22, growth: 0, burst: [0.2, 4, 0.5], mix: TRAINING },
  { id: 'amazonbot', name: 'Amazonbot', operator: 'Amazon', category: 'training', ua: `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36`, ips: ['52.70.240.0/24'], base: 15, growth: 0.1, mix: TRAINING },
  { id: 'applebot', name: 'Applebot', operator: 'Apple', category: 'search_engine', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)', ips: APPLE, base: 12, growth: 0.1, mix: ENGINE },
  { id: 'googlebot', name: 'Googlebot', operator: 'Google', category: 'search_engine', ua: `Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`, ips: GOOGLE_COMMON, base: 75, growth: 0.05, mix: ENGINE },
  { id: 'bingbot', name: 'Bingbot', operator: 'Microsoft', category: 'search_engine', ua: `${WEB}; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/141.0.0.0 Safari/537.36`, ips: BING, base: 45, growth: 0.05, mix: ENGINE },
  { id: 'ccbot', name: 'CCBot', operator: 'Common Crawl', category: 'training', ua: 'CCBot/2.0 (https://commoncrawl.org/faq/)', ips: CCBOT, base: 6, growth: 0, burst: [0.1, 12, 0.35], mix: TRAINING },
  { id: 'ahrefsbot', name: 'AhrefsBot', operator: 'Ahrefs', category: 'seo_tool', ua: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', ips: AHREFS, base: 18, growth: 0, mix: SEO },
  { id: 'claude-searchbot', name: 'Claude-SearchBot', operator: 'Anthropic', category: 'search', ua: `${WEB}; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)`, ips: ANTHROPIC, base: 9, growth: 0.6, mix: SEARCH, firstDaysAgo: 4 },
];

interface SeedReferrer { id: string; name: string; referrer: string; base: number; growth: number }
const REFERRERS: SeedReferrer[] = [
  { id: 'chatgpt', name: 'ChatGPT', referrer: 'https://chatgpt.com/', base: 22, growth: 1.0 },
  { id: 'perplexity', name: 'Perplexity', referrer: 'https://www.perplexity.ai/', base: 8, growth: 0.8 },
  { id: 'gemini', name: 'Gemini', referrer: 'https://gemini.google.com/', base: 5, growth: 0.7 },
  { id: 'copilot', name: 'Copilot', referrer: 'https://copilot.microsoft.com/', base: 3, growth: 0.5 },
  { id: 'claude', name: 'Claude', referrer: 'https://claude.ai/', base: 2, growth: 0.8 },
];
const LANDING: Mix = { blog: 0.36, compare: 0.24, pricing: 0.2, features: 0.08, docs: 0.07, home: 0.05 };

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';

/** Site map for the demo: sections → paths. `missed` pages are only ever fetched by classic search engines. */
function sitePaths(brand: string, industry: string, competitors: string[]): Record<Section, string[]> {
  const b = slug(brand);
  const ind = slug(industry.replace(/\b(software|platforms?|tools?|solutions?)\b/gi, '').trim() || 'software');
  const comps = (competitors.length ? competitors : ['Competitor A', 'Competitor B', 'Competitor C']).slice(0, 4).map(slug);
  return {
    home: ['/'],
    pricing: ['/pricing'],
    features: ['/features/', '/features/automation', '/features/analytics', '/features/integrations', '/features/security', '/features/collaboration', '/features/api'],
    blog: [
      `/blog/best-${ind}-tools`, `/blog/${ind}-pricing-guide`, `/blog/how-to-choose-${ind}`, `/blog/${ind}-trends-2026`,
      `/blog/getting-started-with-${b}`, `/blog/${ind}-for-startups`, `/blog/${ind}-security-checklist`, `/blog/migrating-from-${comps[0]}`,
      `/blog/${ind}-roi-calculator`, `/blog/ai-in-${ind}`, '/blog/customer-story-scaling-ops', '/blog/product-update-q3-2026',
      `/blog/${ind}-best-practices`, '/blog/remote-team-playbook',
    ],
    docs: ['/docs/', '/docs/getting-started', '/docs/api-reference', '/docs/webhooks', '/docs/authentication', '/docs/import-data', '/docs/permissions', '/docs/billing'],
    compare: [...comps.map((c) => `/compare/${b}-vs-${c}`), `/compare/${comps[0]}-alternatives`],
    integrations: ['/integrations/', '/integrations/slack', '/integrations/hubspot', '/integrations/google-workspace', '/integrations/zapier', '/integrations/microsoft-teams'],
    company: ['/about', '/customers', '/security', '/changelog', '/careers', '/contact'],
    meta: ['/robots.txt', '/sitemap.xml'],
    llms: ['/llms.txt'],
    missed: ['/docs/sso-saml-setup', '/integrations/salesforce', '/customers/case-studies', '/features/audit-log', '/security/compliance', '/pricing/enterprise'],
    errors: ['/old-pricing', '/blog/2021/launch-announcement', '/product', '/blog/page/2', '/.well-known/ai-plugin.json'],
  };
}

const STATUS: Record<string, number> = { '/llms.txt': 404, '/old-pricing': 404, '/blog/2021/launch-announcement': 404, '/.well-known/ai-plugin.json': 404, '/product': 301, '/blog/page/2': 301 };

function rng(seedText: string): () => number {
  let a = createHash('sha1').update(seedText).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A host address inside an IPv4 CIDR (network and broadcast addresses skipped when the block has room). */
function ipIn(cidr: string, rand: () => number): string {
  const [net = '0.0.0.0', len = '32'] = cidr.split('/');
  const size = 2 ** (32 - Number(len));
  const base = net.split('.').reduce((n, octet) => n * 256 + Number(octet), 0);
  const host = base - (base % size) + (size > 2 ? 1 + Math.floor(rand() * (size - 2)) : Math.floor(rand() * size));
  return [24, 16, 8, 0].map((shift) => Math.floor(host / 2 ** shift) % 256).join('.');
}

const pick = <T>(rand: () => number, list: T[]): T => list[Math.floor(rand() * list.length)]!;

function pickWeighted<T extends string>(rand: () => number, mix: Partial<Record<T, number>>): T {
  const entries = Object.entries(mix) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [k, w] of entries) if ((x -= w) <= 0) return k;
  return entries[entries.length - 1]![0];
}

/** Seeds realistic AI-crawler + AI-referral events for a (demo) project over the past `days` days. */
export function seedCrawlerData(projectId: string, opts?: { days?: number; siteDomain?: string }): void {
  const days = Math.max(1, Math.min(180, Math.floor(opts?.days ?? 30)));
  const project = getProject(projectId);
  if (!project) throw new Error(`seedCrawlerData: project ${projectId} not found`);
  const brand = project.name || (opts?.siteDomain ?? project.domain).split('.')[0] || 'brand';
  const paths = sitePaths(brand, project.industry, project.competitors.map((c) => c.name));
  const rand = rng(`crawl:${projectId}`);
  const now = Date.now();
  const todayStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());

  // Resolve against the real catalog when it knows the UA (keeps ids consistent with live classification).
  const agents = AGENTS.map((a) => {
    const real = classifyAgent(a.ua) ?? agentById(a.id);
    const id = real?.id ?? a.id;
    const loaded = loadedPrefixes(id)?.filter((p) => !p.includes(':'));
    return { ...a, id, name: real?.name ?? a.name, operator: real?.operator ?? a.operator, category: real?.category ?? a.category, hasList: !!real?.ipRangesUrl, pool: loaded?.length ? loaded : a.ips };
  });
  const referrers = REFERRERS.map((r) => {
    const real = classifyReferrer(r.referrer);
    return { ...r, id: real?.id ?? r.id, name: real?.name ?? r.name };
  });

  const insBot = db.prepare(
    `INSERT INTO bot_events (id, project_id, ts, day, agent_id, agent_name, operator, category, path, status, user_agent, ip, verified, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')`,
  );
  const insRef = db.prepare(
    `INSERT INTO referral_events (id, project_id, ts, day, source_id, source_name, landing_path, referrer, session_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo')`,
  );
  const rid = (p: string) => `${p}_${Math.floor(rand() * 36 ** 8).toString(36).padStart(8, '0')}${Math.floor(rand() * 36 ** 4).toString(36)}`;

  /** Random timestamp within day d (0 = today, never in the future); user traffic skews to US/EU business hours. */
  const tsFor = (dayStart: number, businessHours: boolean): number | null => {
    const hour = businessHours ? 12 + rand() * 11 : rand() * 24;
    const t = dayStart + Math.floor(hour * 3600_000);
    return t <= now ? t : null;
  };

  const write = () => {
    db.prepare("DELETE FROM bot_events WHERE project_id = ? AND source = 'demo'").run(projectId);
    db.prepare("DELETE FROM referral_events WHERE project_id = ? AND source = 'demo'").run(projectId);
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = todayStart - d * 86_400_000;
      const day = new Date(dayStart).toISOString().slice(0, 10);
      const progress = days > 1 ? (days - 1 - d) / (days - 1) : 1;
      const dow = new Date(dayStart).getUTCDay();
      const weekend = dow === 0 || dow === 6;

      for (const a of agents) {
        if (a.firstDaysAgo !== undefined && d > a.firstDaysAgo) continue;
        let n = a.base * (1 + a.growth * progress) * (0.85 + rand() * 0.3);
        if (a.weekday) n *= weekend ? a.weekday[1] : a.weekday[0];
        if (a.burst) n *= rand() < a.burst[0] ? a.burst[1] : a.burst[2];
        let count = Math.round(n);
        if (d === days - 1 || d === a.firstDaysAgo) count = Math.max(1, count);
        const userish = a.category === 'user_fetch';
        for (let i = 0; i < count; i++) {
          const t = tsFor(dayStart, userish && rand() < 0.75);
          if (t === null) continue;
          const section = pickWeighted(rand, a.mix);
          const list = paths[section];
          const path = list[Math.floor(rand() * list.length)]!;
          const status = rand() < 0.003 ? 503 : STATUS[path] ?? 200;
          const spoofed = a.spoof !== undefined && rand() < a.spoof;
          const ip = ipIn(pick(rand, spoofed ? RESIDENTIAL : a.pool), rand);
          // Same check as live hits; before the lists have ever loaded, hits from the snapshot prefixes count as verified.
          const verified = spoofed ? SPOOFED : a.hasList ? verifyIp(a.id, ip) || VERIFIED : UNVERIFIED;
          insBot.run(rid('bot'), projectId, new Date(t).toISOString(), day, a.id, a.name, a.operator, a.category, path, status, a.ua, ip, verified);
        }
      }

      for (const r of referrers) {
        const n = r.base * (1 + r.growth * progress) * (weekend ? 0.7 : 1.15) * (0.8 + rand() * 0.4);
        const count = Math.round(n);
        for (let i = 0; i < count; i++) {
          const t = tsFor(dayStart, rand() < 0.8);
          if (t === null) continue;
          const list = paths[pickWeighted(rand, LANDING)];
          insRef.run(rid('ref'), projectId, new Date(t).toISOString(), day, r.id, r.name, list[Math.floor(rand() * list.length)]!, r.referrer, rid('s'));
        }
      }
    }
  };
  if (db.isTransaction) write();
  else tx(write);
}
