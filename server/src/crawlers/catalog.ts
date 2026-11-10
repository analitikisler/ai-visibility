// Agent / referrer catalog access for ingestion, audits and the demo seed (catalogs: data/ai-agents.ts, data/ai-referrers.ts).
import { AI_AGENTS, agentById, matchAgent } from '../data/ai-agents.ts';
import { AI_REFERRERS, matchReferrer } from '../data/ai-referrers.ts';
import type { AgentCategory, AiAgent, AiReferrer } from '../../../shared/types.ts';

export { agentById };

/** Categories that represent AI systems (as opposed to classic search engines and SEO tools). */
export const AI_CATEGORIES: AgentCategory[] = ['training', 'search', 'user_fetch', 'agent'];
export const ALL_CATEGORIES: AgentCategory[] = ['training', 'search', 'user_fetch', 'agent', 'search_engine', 'seo_tool'];

export function agentCatalog(): AiAgent[] {
  return AI_AGENTS;
}

export function referrerCatalog(): AiReferrer[] {
  return AI_REFERRERS;
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
  return matchAgent(userAgent);
}

/** Classifies a referrer (and/or landing URL with utm_source) as an AI assistant, or null. */
export function classifyReferrer(referrer: string, url?: string): AiReferrer | null {
  return matchReferrer(referrer, url);
}
