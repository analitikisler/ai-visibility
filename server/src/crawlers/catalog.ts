// Agent / referrer catalog access for Signals. Uses Research's catalogs (data/ai-agents.ts, data/ai-referrers.ts)
// whenever they are populated, and a compact built-in fallback otherwise so ingestion, audits and the demo seed
// keep working before (or without) the full catalog.
import { AI_AGENTS, matchAgent } from '../data/ai-agents.ts';
import { AI_REFERRERS, matchReferrer } from '../data/ai-referrers.ts';
import type { AgentCategory, AiAgent, AiReferrer } from '../../../shared/types.ts';

/** Categories that represent AI systems (as opposed to classic search engines and SEO tools). */
export const AI_CATEGORIES: AgentCategory[] = ['training', 'search', 'user_fetch', 'agent'];
export const ALL_CATEGORIES: AgentCategory[] = ['training', 'search', 'user_fetch', 'agent', 'search_engine', 'seo_tool'];

type FallbackSpec = [id: string, name: string, operator: string, category: AgentCategory, pattern: string, robotsTokens: string[], product?: string];

const FALLBACK_SPECS: FallbackSpec[] = [
  ['gptbot', 'GPTBot', 'OpenAI', 'training', 'GPTBot', ['GPTBot'], 'ChatGPT'],
  ['oai-searchbot', 'OAI-SearchBot', 'OpenAI', 'search', 'OAI-SearchBot', ['OAI-SearchBot'], 'ChatGPT search'],
  ['chatgpt-user', 'ChatGPT-User', 'OpenAI', 'user_fetch', 'ChatGPT-User', ['ChatGPT-User'], 'ChatGPT'],
  ['claudebot', 'ClaudeBot', 'Anthropic', 'training', 'ClaudeBot', ['ClaudeBot', 'anthropic-ai'], 'Claude'],
  ['claude-searchbot', 'Claude-SearchBot', 'Anthropic', 'search', 'Claude-SearchBot', ['Claude-SearchBot'], 'Claude'],
  ['claude-user', 'Claude-User', 'Anthropic', 'user_fetch', 'Claude-User', ['Claude-User'], 'Claude'],
  ['perplexitybot', 'PerplexityBot', 'Perplexity', 'search', 'PerplexityBot', ['PerplexityBot'], 'Perplexity'],
  ['perplexity-user', 'Perplexity-User', 'Perplexity', 'user_fetch', 'Perplexity-User', ['Perplexity-User'], 'Perplexity'],
  ['google-extended', 'Google-Extended', 'Google', 'training', '', ['Google-Extended'], 'Gemini'],
  ['applebot-extended', 'Applebot-Extended', 'Apple', 'training', '', ['Applebot-Extended'], 'Apple Intelligence'],
  ['meta-externalagent', 'Meta-ExternalAgent', 'Meta', 'training', 'meta-externalagent', ['meta-externalagent'], 'Meta AI'],
  ['bytespider', 'Bytespider', 'ByteDance', 'training', 'Bytespider', ['Bytespider'], 'Doubao'],
  ['ccbot', 'CCBot', 'Common Crawl', 'training', 'CCBot', ['CCBot']],
  ['amazonbot', 'Amazonbot', 'Amazon', 'training', 'Amazonbot', ['Amazonbot'], 'Alexa'],
  ['applebot', 'Applebot', 'Apple', 'search_engine', 'Applebot', ['Applebot'], 'Siri & Spotlight'],
  ['duckassistbot', 'DuckAssistBot', 'DuckDuckGo', 'user_fetch', 'DuckAssistBot', ['DuckAssistBot'], 'DuckAssist'],
  ['chatgpt-agent', 'ChatGPT agent', 'OpenAI', 'agent', '', [], 'ChatGPT agent'],
  ['googlebot', 'Googlebot', 'Google', 'search_engine', 'Googlebot', ['Googlebot'], 'Google Search & AI Overviews'],
  ['bingbot', 'Bingbot', 'Microsoft', 'search_engine', 'bingbot', ['Bingbot'], 'Bing & Copilot'],
  ['ahrefsbot', 'AhrefsBot', 'Ahrefs', 'seo_tool', 'AhrefsBot', ['AhrefsBot']],
  ['semrushbot', 'SemrushBot', 'Semrush', 'seo_tool', 'SemrushBot', ['SemrushBot']],
];

const FALLBACK_AGENTS: AiAgent[] = FALLBACK_SPECS.map(([id, name, operator, category, pattern, robotsTokens, product]) => ({
  id, name, operator, category, product, pattern, robotsTokens,
  uaDetectable: pattern !== '',
  respectsRobots: category !== 'seo_tool' || id === 'ahrefsbot',
  description: `${name} (${operator})`,
}));
const FALLBACK_RES = FALLBACK_AGENTS.filter((a) => a.uaDetectable).map((a) => ({ agent: a, re: new RegExp(a.pattern, 'i') }));

const FALLBACK_REFERRERS: AiReferrer[] = [
  { id: 'chatgpt', name: 'ChatGPT', operator: 'OpenAI', hosts: ['chatgpt.com', 'chat.openai.com'], utmSources: ['chatgpt.com', 'chatgpt'] },
  { id: 'perplexity', name: 'Perplexity', operator: 'Perplexity', hosts: ['perplexity.ai'], utmSources: ['perplexity', 'perplexity.ai'] },
  { id: 'gemini', name: 'Gemini', operator: 'Google', hosts: ['gemini.google.com', 'bard.google.com'], utmSources: ['gemini'] },
  { id: 'copilot', name: 'Copilot', operator: 'Microsoft', hosts: ['copilot.microsoft.com', 'copilot.cloud.microsoft'], utmSources: ['copilot'] },
  { id: 'claude', name: 'Claude', operator: 'Anthropic', hosts: ['claude.ai'], utmSources: ['claude', 'claude.ai'] },
  { id: 'deepseek', name: 'DeepSeek', operator: 'DeepSeek', hosts: ['chat.deepseek.com'], utmSources: ['deepseek'] },
  { id: 'grok', name: 'Grok', operator: 'xAI', hosts: ['grok.com'], utmSources: ['grok'] },
  { id: 'meta-ai', name: 'Meta AI', operator: 'Meta', hosts: ['meta.ai'], utmSources: ['meta.ai'] },
];

/** Agent catalog (Research's when populated). */
export function agentCatalog(): AiAgent[] {
  return AI_AGENTS.length ? AI_AGENTS : FALLBACK_AGENTS;
}

export function referrerCatalog(): AiReferrer[] {
  return AI_REFERRERS.length ? AI_REFERRERS : FALLBACK_REFERRERS;
}

export function agentById(id: string): AiAgent | undefined {
  return agentCatalog().find((a) => a.id === id);
}

/**
 * Agents that browse with a normal browser UA but sign requests (Web Bot Auth, RFC 9421): the `Signature-Agent`
 * header names the operator, e.g. `"https://chatgpt.com"`.
 */
const SIGNATURE_AGENTS: [RegExp, string][] = [[/^"?https:\/\/chatgpt\.com\/?"?$/i, 'chatgpt-agent']];

/** Classifies a hit as a known bot/agent (Signature-Agent header first, then User-Agent), or null for humans/unknown. */
export function classifyAgent(userAgent: string, signatureAgent?: string): AiAgent | null {
  const sig = signatureAgent?.trim();
  if (sig) {
    const hit = SIGNATURE_AGENTS.find(([re]) => re.test(sig));
    const agent = hit && agentById(hit[1]);
    if (agent) return agent;
  }
  if (!userAgent) return null;
  if (AI_AGENTS.length) return matchAgent(userAgent);
  return FALLBACK_RES.find((f) => f.re.test(userAgent))?.agent ?? null;
}

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function utmSourceOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return (new URL(url, 'http://x.invalid').searchParams.get('utm_source') ?? '').toLowerCase();
  } catch {
    return '';
  }
}

/** Classifies a referrer (and/or landing URL with utm_source) as an AI assistant, or null. */
export function classifyReferrer(referrer: string, url?: string): AiReferrer | null {
  if (!referrer && !url) return null;
  if (AI_REFERRERS.length) return matchReferrer(referrer, url);
  const host = hostOf(referrer);
  const utm = utmSourceOf(url);
  return (
    FALLBACK_REFERRERS.find(
      (r) =>
        (host && r.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ||
        (utm && (r.utmSources ?? []).includes(utm)),
    ) ?? null
  );
}
