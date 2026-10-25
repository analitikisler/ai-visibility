// Simulated engine: deterministic (prompt + engine + day) markdown answers that read like real assistant output.
// Which tracked entities appear, in what order and tone comes from sim-profile.ts; engines differ in style,
// verbosity and citation habits (Perplexity cites most, Claude fewer, DeepSeek never).
import type { EngineId, PromptIntent } from '../../../shared/types.ts';
import { detectMentions, trackedEntities } from '../analysis/entities.ts';
import { sampleUrlPath, sourceDomainsFor } from '../data/sources.ts';
import { Rng, hashStr, unit } from './prng.ts';
import { affinity, dailyNoise, siteCitationRate, sourceFootprint, strength, tone, type SimEntity } from './sim-profile.ts';
import type { AskContext, EngineAnswer, EngineCitation } from './types.ts';

// ---------------------------------------------------------------- engine styles

interface Style {
  cites: [number, number];
  /** How sources show up inline: markdown links (ChatGPT), [n] markers (Perplexity) or not at all. */
  inline: 'link' | 'marker' | 'none';
  /** Brand-site citation propensity. */
  own: number;
  comparison: number;
  closing: number;
  latency: [number, number];
  intros: string[];
  closings: string[];
  /** Gemini-like "**Name:**" items instead of "**Name** —". */
  colonItems: boolean;
}

const COMMON_TIPS = [
  '**Tip:** Shortlist two or three options and run a free trial with your real workflows before committing.',
  '**Tip:** Check how each tool handles {feature} — that is where the day-to-day differences show up.',
  '**Tip:** Compare total cost of ownership, not just the per-seat price; add-ons and higher tiers add up quickly.',
];

const STYLES: Record<EngineId, Style> = {
  chatgpt: {
    cites: [2, 5], inline: 'link', own: 0.3, comparison: 0.45, closing: 0.85, latency: [1800, 5200], colonItems: false,
    intros: [
      'Here are some of the best {category} options in {year}, depending on your team size and needs:',
      'Great question — there is no single “best” choice, but these are the {category} tools most teams shortlist:',
      'Based on reviews, feature depth and pricing, these are the strongest contenders right now:',
    ],
    closings: [...COMMON_TIPS, 'If you tell me your team size and budget, I can narrow this down to one or two picks.'],
  },
  claude: {
    cites: [1, 3], inline: 'none', own: 0.2, comparison: 0.55, closing: 0.75, latency: [2400, 7000], colonItems: false,
    intros: [
      'A few options consistently stand out, though the right choice depends on what you prioritize:',
      'There are several strong choices here. Here is how I would think about the main ones:',
      'It depends a lot on your workflow, but these are the {category} options I would look at first:',
    ],
    closings: [
      'If you share your team size, budget and must-have integrations, I can help you narrow this down.',
      'My suggestion: pick two finalists and test them against your three most common workflows before deciding.',
    ],
  },
  gemini: {
    cites: [2, 4], inline: 'none', own: 0.2, comparison: 0.35, closing: 0.6, latency: [1200, 3800], colonItems: true,
    intros: [
      'Choosing the right {category} depends on your specific needs, budget and team size. Here is a breakdown of the leading options:',
      '### Top {Category} Options for {year}\n\nHere are the platforms that come up most often:',
      'There are many {category} options available. Here are some of the most popular ones:',
    ],
    closings: [...COMMON_TIPS, '**Key considerations:** ease of use, scalability, integrations and pricing.'],
  },
  perplexity: {
    cites: [4, 6], inline: 'marker', own: 0.45, comparison: 0.3, closing: 0.45, latency: [900, 2600], colonItems: false,
    intros: [
      'The most recommended {category} options in {year} include {top}, each with different strengths.',
      'Top {category} picks for {year} are {top}, based on recent reviews and comparisons.',
    ],
    closings: COMMON_TIPS,
  },
  grok: {
    cites: [0, 2], inline: 'none', own: 0.15, comparison: 0.4, closing: 0.5, latency: [1500, 4200], colonItems: false,
    intros: [
      'Short answer: it depends on your setup, but here is the shortlist people actually use:',
      'Plenty of options out there. The ones worth your time:',
    ],
    closings: ['Honestly, most of these are fine — the deciding factor is usually {feature} and price.', ...COMMON_TIPS],
  },
  deepseek: {
    cites: [0, 0], inline: 'none', own: 0, comparison: 0.35, closing: 0.5, latency: [2000, 6500], colonItems: false,
    intros: ['Here are some popular {category} options:', 'Several tools are commonly recommended for this:'],
    closings: COMMON_TIPS,
  },
};

// ---------------------------------------------------------------- vocabulary

interface Vocab { category: string; features: string[]; suffixes: string[] }

const SEGMENTS = [
  'startups', 'small teams', 'mid-market companies', 'enterprise teams', 'fast-growing SaaS companies',
  'distributed teams', 'budget-conscious teams', 'product-led teams',
];

function vocabFor(industry: string): Vocab {
  const i = industry.toLowerCase();
  const category = !i ? 'software' : /software|platform|tool|app/.test(i) ? i : `${i} software`;
  if (/support|help ?desk|ticket|customer service|service desk/.test(i)) {
    return { category, suffixes: ['Desk', 'Support', 'Assist', 'Care'], features: ['ticket routing', 'automation rules', 'shared inbox', 'SLA tracking', 'knowledge base', 'AI reply suggestions', 'live chat', 'reporting'] };
  }
  if (/project|task|work management|productivity/.test(i)) {
    return { category, suffixes: ['Plan', 'Tasks', 'Works', 'Board'], features: ['task dependencies', 'timeline views', 'resource planning', 'automations', 'time tracking', 'templates', 'reporting dashboards', 'integrations'] };
  }
  if (/crm|sales/.test(i)) {
    return { category, suffixes: ['CRM', 'Sales', 'Pipe', 'Deals'], features: ['pipeline management', 'email sequences', 'forecasting', 'lead scoring', 'integrations', 'reporting', 'mobile app'] };
  }
  if (/market|seo|content/.test(i)) {
    return { category, suffixes: ['Reach', 'Metrics', 'Studio', 'Grow'], features: ['campaign automation', 'segmentation', 'analytics', 'A/B testing', 'templates', 'integrations'] };
  }
  if (/analytic|data|\bbi\b|insight/.test(i)) {
    return { category, suffixes: ['Metrics', 'Lens', 'Insights', 'Data'], features: ['dashboards', 'data connectors', 'SQL support', 'sharing and permissions', 'alerting', 'embedded analytics'] };
  }
  return { category, suffixes: ['HQ', 'Flow', 'Hub', 'Works'], features: ['automation', 'reporting', 'integrations', 'AI features', 'collaboration', 'customization', 'onboarding', 'security controls'] };
}

const PREFIXES = ['Nimbus', 'Brightline', 'Clearpath', 'Fluent', 'Orbit', 'Pillar', 'Summit', 'Beacon', 'Keystone', 'Lumen', 'Vantage', 'Cobalt', 'Northstar', 'Harbor', 'Parallel', 'Quanta'];

/** Stable set of untracked fictional vendors per project (adds realism, dilutes share of voice). */
function genericVendors(seed: string, vocab: Vocab, taken: string[]): string[] {
  const rng = new Rng(`generic|${seed}`);
  const names = rng.sample(PREFIXES, 8).map((p) => (rng.chance(0.5) ? `${p}${rng.pick(vocab.suffixes)}` : `${p} ${rng.pick(vocab.suffixes)}`));
  const lower = taken.map((t) => t.toLowerCase());
  return [...new Set(names)].filter((n) => !lower.some((t) => n.toLowerCase().includes(t) || t.includes(n.toLowerCase()))).slice(0, 6);
}

const DESCRIPTORS = [
  'Best for {segment} that need strong {feature}.',
  'A popular pick for {segment}.',
  'Built for {segment}, with a focus on {feature}.',
  'Often shortlisted by {segment} that care about {feature}.',
  'A good fit for {segment} that want to move fast.',
];
const POSITIVE = [
  'Users consistently praise its intuitive interface and excellent {feature}.',
  'Reviewers highlight reliable performance and genuinely helpful customer support.',
  'It is known for powerful {feature} and a smooth, fast onboarding experience.',
  'Teams love how easy it is to set up, and it is among the best in the category for {feature}.',
  'A strong, well-rounded choice with great {feature} and transparent pricing.',
  'Frequently recommended for its clean design, quick setup and excellent value.',
];
const MIXED = [
  'Solid {feature}, though some advanced features are locked behind higher tiers.',
  'A capable all-rounder; pricing is in line with the market.',
  'Good {feature}, but the interface takes some getting used to.',
  'Flexible and feature-rich, although setup can take longer than expected.',
  'Works well for most teams, but reporting is fairly basic.',
];
const NEGATIVE = [
  'Some users report slow support response times and a clunky interface.',
  'It can get expensive quickly, and several reviews mention a steep learning curve.',
  'Reviewers note limited {feature} and occasional reliability issues.',
  'Customers complain about confusing pricing and frequent bugs after updates.',
  'It feels dated compared to newer tools, and integrations are limited.',
];
const HOW_TO_STEPS = [
  '**Map your current workflow.** Document where requests come in, who owns them and where things get stuck.',
  '**Define success metrics.** Pick two or three KPIs (response time, resolution rate or cycle time) and baseline them.',
  '**Automate the repetitive parts.** Templates, routing rules and self-service answers free the team for high-value work.',
  '**Roll out in phases.** Pilot with one team, collect feedback, then expand.',
  '**Document the process.** A short internal playbook keeps everyone consistent as the team grows.',
  '**Review monthly.** Use reporting to spot bottlenecks and adjust rules, ownership and templates.',
];

// ---------------------------------------------------------------- helpers

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

interface Ctx {
  rng: Rng;
  vocab: Vocab;
  style: Style;
  year: string;
}

function fill(template: string, c: Ctx, extra: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (k in extra) return extra[k]!;
    if (k === 'feature') return c.rng.pick(c.vocab.features);
    if (k === 'segment') return c.rng.pick(SEGMENTS);
    if (k === 'category') return c.vocab.category;
    if (k === 'Category') return titleCase(c.vocab.category);
    if (k === 'year') return c.year;
    return m;
  });
}

function phrase(toneValue: number, c: Ctx): string {
  const pool = toneValue > 0.22 ? POSITIVE : toneValue < -0.18 ? NEGATIVE : MIXED;
  return fill(c.rng.pick(pool), c);
}

/** Prominence of the i-th recommended entity when blending source footprints (first pick dominates). */
const PROMINENCE = [1, 0.7, 0.5];

/**
 * Picks the answer's sources. Domain weight = catalog weight × engine preference × each recommended entity's
 * footprint multiplier raised to its prominence, so sources co-occur with the entities they "back".
 * `included` is ordered by prominence; citations use their own RNG stream (`c.rng` here is citation-only).
 */
function pickCitations(engine: EngineId, ctx: AskContext, included: SimEntity[], c: Ctx): EngineCitation[] {
  const { project, prompt } = ctx;
  const [lo, hi] = c.style.cites;
  const n = c.rng.int(lo, hi);
  if (hi === 0) return [];
  const topic = `${c.vocab.category} ${prompt.topic}`.trim();
  const seed = hashStr(`${prompt.text}|${engine}|${ctx.day}`);
  const pool = sourceDomainsFor(project.industry);
  const footprints = included.map((e, i) => ({ f: sourceFootprint(project, e, pool), p: PROMINENCE[i] ?? 0.35 }));
  const bias = (domain: string) => footprints.reduce((m, { f, p }) => m * (f.get(domain) ?? 1) ** p, 1);
  // Engine-specific preference so engines cite visibly different sources.
  const third = c.rng.sample(pool, n, (d) => d.weight * (0.35 + 1.3 * unit(`${engine}|${d.domain}`)) * bias(d.domain));
  const out: EngineCitation[] = third.map((d, i) => {
    const path = sampleUrlPath(d.domain, topic, seed + i);
    const sub = /^\/r\/([^/]+)/.exec(path)?.[1];
    return {
      url: `https://${d.domain}${path}`,
      title: sub ? `${prompt.text.replace(/[?.!]+$/, '')} : r/${sub}` : `${titleCase(topic)} (${c.year}) | ${d.title}`,
    };
  });
  const brand = included.find((e) => e.isBrand);
  if (project.domain && c.rng.chance(c.style.own * (brand ? 1 : 0.25))) {
    const page = c.rng.pick(['/pricing', '/features', '/customers', '/integrations', `/blog/${slug(prompt.topic || c.vocab.category)}`]);
    out.splice(c.rng.int(0, out.length), 0, { url: `https://${project.domain}${page}`, title: `${project.name} — ${titleCase(page.split('/').pop()!.replace(/-/g, ' '))}` });
  }
  for (const e of included) {
    if (e.isBrand || !e.domain || !c.rng.chance(siteCitationRate(project, e, engine))) continue;
    out.push({ url: `https://${e.domain}${c.rng.pick(['/pricing', '/features', '/compare', '/product'])}`, title: `${e.name} — ${c.rng.pick(['Pricing', 'Features', 'Compare plans', 'Product tour'])}` });
  }
  return out.slice(0, hi + 1);
}

// ---------------------------------------------------------------- answer builders

interface Option { name: string; tone: number; tracked: boolean }

/** Adds inline citations to a line in the engine's style. */
function cite(line: string, cites: EngineCitation[], c: Ctx, i: number): string {
  if (!cites.length) return line;
  if (c.style.inline === 'marker') return `${line} [${(i % cites.length) + 1}]`;
  if (c.style.inline === 'link' && c.rng.chance(0.35)) {
    const ci = cites[c.rng.int(0, cites.length - 1)]!;
    const host = new URL(ci.url).hostname.replace(/^www\./, '');
    return `${line} ([${host}](${ci.url}))`;
  }
  return line;
}

function optionLines(options: Option[], cites: EngineCitation[], c: Ctx, start = 1): string[] {
  return options.map((o, i) => {
    const desc = fill(c.rng.pick(DESCRIPTORS), c);
    const body = `${desc} ${phrase(o.tone + c.rng.range(-0.4, 0.4), c)}`;
    const head = c.style.colonItems ? `**${o.name}:**` : `**${o.name}** —`;
    return cite(`${start + i}. ${head} ${body}`, cites, c, i);
  });
}

function comparisonParagraph(a: Option, b: Option, c: Ctx): string {
  return fill(c.rng.pick([
    '**How they compare:** **{a}** generally wins on {feature}, while **{b}** is the better fit for {segment}.',
    'If {feature} matters most, **{a}** is hard to beat; **{b}** tends to be the simpler choice for {segment}.',
    'In head-to-head comparisons, **{a}** is usually rated higher for {feature}, whereas **{b}** stands out on price.',
  ]), c, { a: a.name, b: b.name });
}

function verdict(name: string, t: number, c: Ctx): string {
  if (t > 0.22) return fill(`**Verdict:** ${name} is a strong choice for {segment}, especially if {feature} is a priority.`, c);
  if (t < -0.18) return fill(`**Verdict:** ${name} is worth a trial, but many teams outgrow it, so compare the alternatives first.`, c);
  return `**Verdict:** ${name} is a reasonable option, but compare it against the alternatives above before committing.`;
}

function closing(c: Ctx): string | null {
  return c.rng.chance(c.style.closing) ? fill(c.rng.pick(c.style.closings), c) : null;
}

const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function buildDiscovery(options: Option[], cites: EngineCitation[], c: Ctx): string[] {
  const top = joinNames(options.slice(0, 3).map((o) => `**${o.name}**`));
  const blocks = [fill(c.rng.pick(c.style.intros), c, { top }), optionLines(options, cites, c).join('\n')];
  const tracked = options.filter((o) => o.tracked);
  if (tracked.length >= 2 && c.rng.chance(c.style.comparison)) blocks.push(comparisonParagraph(tracked[0]!, tracked[1]!, c));
  return blocks;
}

function buildAlternatives(target: Option, options: Option[], cites: EngineCitation[], c: Ctx): string[] {
  const intro = fill(c.rng.pick([
    `If **${target.name}** is not the right fit (pricing and {feature} are the usual reasons), here are solid alternatives:`,
    `Teams moving away from **${target.name}** most often switch to one of these:`,
    `There are several good alternatives to **${target.name}**, depending on what you need:`,
  ]), c);
  return [intro, optionLines(options, cites, c).join('\n')];
}

function buildComparison(named: Option[], others: Option[], cites: EngineCitation[], c: Ctx): string[] {
  const [a, b] = named as [Option, Option];
  const blocks = [
    fill(`**${a.name}** and **${b.name}** are both popular, but they are built for slightly different teams. Here is a quick comparison:`, c),
    optionLines(named, cites, c).join('\n'),
  ];
  if (others.length) blocks.push(`**Other options worth a look:** ${joinNames(others.slice(0, 3).map((o) => `**${o.name}**`))}.`);
  const [win, lose] = a.tone >= b.tone ? [a, b] : [b, a];
  blocks.push(fill(`**Bottom line:** choose **${win.name}** if {feature} is your priority; go with **${lose.name}** if you are one of the {segment} that value a lower price.`, c));
  return blocks;
}

function buildBranded(subject: Option, alternatives: Option[], cites: EngineCitation[], c: Ctx): string[] {
  const t = subject.tone + c.rng.range(-0.3, 0.3);
  const likes = c.rng.sample(POSITIVE, t > 0 ? 3 : 2).map((p) => `- ${fill(p, c)}`);
  const dislikes = c.rng.sample(NEGATIVE, t > 0.3 ? 1 : 2).map((p) => `- ${fill(p, c)}`);
  const blocks = [
    cite(fill(`**${subject.name}** is a {category} platform used mostly by {segment}. ${phrase(t, c)}`, c), cites, c, 0),
    `**What users like:**\n${likes.join('\n')}`,
    `**Common complaints:**\n${dislikes.join('\n')}`,
  ];
  if (alternatives.length) blocks.push(`**Alternatives to consider:**\n${optionLines(alternatives.slice(0, 4), cites, c).join('\n')}`);
  blocks.push(verdict(subject.name, t, c));
  return blocks;
}

function buildHowTo(tools: Option[], cites: EngineCitation[], c: Ctx): string[] {
  // Keep the playbook in its natural order: sample a subset of steps, then restore their original sequence.
  const steps = c.rng.sample(HOW_TO_STEPS, c.rng.int(4, 5)).sort((a, b) => HOW_TO_STEPS.indexOf(a) - HOW_TO_STEPS.indexOf(b)).map((s) => fill(s, c));
  const toolNames = tools.slice(0, 3).map((o) => `**${o.name}**`);
  const toolStep = toolNames.length
    ? `**Pick tooling that fits.** Platforms like ${joinNames(toolNames)} support this out of the box. Of these, ${tools[0]!.name} comes up most often: ${phrase(tools[0]!.tone, c)}`
    : '**Pick tooling that fits.** Most modern platforms support this out of the box, so prioritize ease of use and integrations.';
  steps.splice(Math.min(2, steps.length), 0, toolStep);
  return ['Here is a practical way to approach it:', steps.map((s, i) => cite(`${i + 1}. ${s}`, cites, c, i)).join('\n')];
}

// ---------------------------------------------------------------- entry point

function resolveIntent(intent: PromptIntent, named: SimEntity[]): PromptIntent {
  if (intent === 'comparison' && named.length < 2) return named.length ? 'alternatives' : 'discovery';
  if (intent === 'alternatives' && !named.length) return 'discovery';
  return intent;
}

export function simulateAnswer(engine: EngineId, promptText: string, ctx: AskContext): EngineAnswer {
  const { project, prompt, day } = ctx;
  const style = STYLES[engine];
  const c: Ctx = { rng: new Rng(`${promptText}|${engine}|${day}`), vocab: vocabFor(project.industry), style, year: day.slice(0, 4) };

  const tracked = trackedEntities(project);
  const sims: SimEntity[] = tracked.map((t) => ({ key: t.key, name: t.name, domain: t.domain, isBrand: t.type === 'brand' }));
  const named = detectMentions(promptText, tracked).map((m) => sims.find((s) => s.key === m.entity.key)!);
  const intent = resolveIntent(prompt.intent, named);
  const subject = intent === 'branded' ? (named[0] ?? sims[0]!) : null;
  const pinned = new Set<SimEntity>(subject ? [subject] : intent === 'discovery' || intent === 'how_to' ? [] : named);

  // Decide which tracked entities the engine brings up, then rank them.
  const picked = sims
    .filter((e) => !pinned.has(e))
    .map((e) => {
      const base = strength(project, e, engine, day) + affinity(project, e, prompt) + dailyNoise(e, engine, day);
      let p = base;
      if (intent === 'how_to') p *= 0.55;
      if (prompt.tier === 'foundational') p *= 0.8;
      if (intent === 'comparison') p *= 0.45;
      if (intent === 'branded') p *= 0.6;
      const include = named.includes(e) || c.rng.chance(clamp(p, 0.02, 0.95));
      return { e, include, score: base + c.rng.range(0, 0.3) };
    })
    .filter((x) => x.include)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const asOption = (e: SimEntity): Option => ({ name: e.name, tone: tone(project, e, engine, day), tracked: true });
  const generics = genericVendors(project.domain || project.name, c.vocab, sims.map((s) => s.name));
  const target = intent === 'branded' || intent === 'comparison' ? c.rng.int(2, 4) : c.rng.int(4, 7);
  const fillers = c.rng.sample(generics, clamp(target - picked.length, picked.length ? 0 : 2, 3));
  const options: Option[] = [
    ...picked.map((x) => ({ opt: asOption(x.e), score: x.score })),
    ...fillers.map((name) => ({ opt: { name, tone: c.rng.range(-0.2, 0.4), tracked: false }, score: 0.2 + c.rng.range(0, 0.4) })),
  ].sort((a, b) => b.score - a.score).map((x) => x.opt);

  const mentioned = [...pinned, ...picked.map((x) => x.e)];
  const cites = pickCitations(engine, ctx, mentioned, { ...c, rng: new Rng(`${promptText}|${engine}|${day}|cites`) });
  const pinnedOpts = [...pinned].map(asOption);

  let blocks: string[];
  if (intent === 'branded') blocks = buildBranded(asOption(subject!), options, cites, c);
  else if (intent === 'comparison') blocks = buildComparison(pinnedOpts, options, cites, c);
  else if (intent === 'alternatives') blocks = buildAlternatives(pinnedOpts[0]!, options, cites, c);
  else if (intent === 'how_to') blocks = buildHowTo(options, cites, c);
  else blocks = buildDiscovery(options, cites, c);
  const end = closing(c);
  if (end) blocks.push(end);

  return {
    text: blocks.join('\n\n'),
    citations: cites,
    model: 'simulated',
    mode: 'simulated',
    latencyMs: c.rng.int(style.latency[0], style.latency[1]),
    error: null,
  };
}
