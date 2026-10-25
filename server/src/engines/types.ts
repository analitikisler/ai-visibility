// Engine adapter contract shared by live providers and the simulator.
import type { EngineMode, Project, Prompt } from '../../../shared/types.ts';

export interface EngineCitation {
  url: string;
  title: string;
}

/** Billable usage of one live call, as reported by the provider. */
export interface EngineUsage {
  /** All input tokens, including cached ones and search results fed back to the model. */
  inputTokens: number;
  /** Output tokens, including reasoning/thinking tokens (billed as output by every provider). */
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache. */
  cachedTokens: number;
  /** Web searches / grounding queries the provider ran (and bills per call). */
  searchCalls: number;
}

export const NO_USAGE: EngineUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, searchCalls: 0 };

export function addUsage(a: EngineUsage, b: EngineUsage): EngineUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    searchCalls: a.searchCalls + b.searchCalls,
  };
}

export interface EngineAnswer {
  text: string;
  citations: EngineCitation[];
  model: string;
  mode: EngineMode;
  /** Wall time of the live call; null for batch answers. */
  latencyMs: number | null;
  /** Set when the call failed; the response row is still stored so runs never crash. */
  error: string | null;
  /** Live answers only. */
  usage?: EngineUsage | null;
  /** Estimated USD at list prices (after batch/cache discounts); live answers only. */
  costUsd?: number | null;
  /** Answered through a provider batch API. */
  batch?: boolean;
}

export interface AskContext {
  project: Project;
  prompt: Pick<Prompt, 'id' | 'text' | 'topic' | 'tier' | 'intent'>;
  /** 'YYYY-MM-DD' the answer is for (seeding passes historical days). */
  day: string;
  /** Part of a cost-saving ('batch') run: use economy processing where the provider has it. */
  economy?: boolean;
}

/** Plain completion (no web search) used by lib/llm.ts. */
export interface CompleteRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  json?: boolean;
  /** Stable key for providers that route prompt-cache hits by key (OpenAI `prompt_cache_key`). */
  cacheKey?: string;
}

/** What a provider returns for one answered prompt (realtime or from a batch). */
export interface SearchResult {
  text: string;
  citations: EngineCitation[];
  model: string;
  usage: EngineUsage;
  /** Exact cost when the provider reports it (Perplexity `usage.cost`, xAI `cost_in_usd_ticks`); preferred over estimates. */
  reportedCostUsd?: number;
  /** Served on a discounted tier (OpenAI flex): tokens billed at batch rates. */
  discounted?: boolean;
}

export interface ProviderCtx {
  apiKey: string;
  model: string;
  market?: string;
  /** Cheaper, slower processing where the provider offers it for realtime calls (OpenAI flex tier). */
  economy?: boolean;
}

/**
 * Optional provider batch API (~50% cheaper, asynchronous). `submit` returns the provider's batch id;
 * `results` maps each custom id to an answer or an error message. Results may arrive in any order.
 */
export interface BatchAdapter {
  submit(items: { customId: string; promptText: string }[], ctx: ProviderCtx): Promise<string>;
  check(batchId: string, ctx: ProviderCtx): Promise<{ state: 'pending' } | { state: 'ended' } | { state: 'failed'; error: string }>;
  results(batchId: string, ctx: ProviderCtx): Promise<Map<string, SearchResult | { error: string }>>;
}

/** A live provider: `search` answers like the consumer product (with web grounding), `complete` is a plain call. */
export interface LiveProvider {
  search(promptText: string, ctx: ProviderCtx): Promise<SearchResult>;
  complete(req: CompleteRequest, ctx: Omit<ProviderCtx, 'market'>): Promise<{ text: string; model: string; usage: EngineUsage }>;
  batch?: BatchAdapter;
}
