// List prices for cost estimates (USD). Estimates, not invoices: provider-reported cost (Perplexity, xAI) is used
// instead whenever an answer carries one. Update PRICING_AS_OF with the table. Sources:
//   OpenAI      https://developers.openai.com/api/docs/pricing          (flex/batch = 50% off tokens; web search $10/1k calls)
//   Anthropic   https://platform.claude.com/docs/en/about-claude/pricing (batch = 50% off tokens; web search $10/1k)
//   Gemini      https://ai.google.dev/gemini-api/docs/pricing           (batch = 50% off; grounding $35/1k prompts after 1,500/day free)
//   Perplexity  https://docs.perplexity.ai/docs/getting-started/pricing (Agent API; fast web search $1/1k)
//   xAI         https://docs.x.ai/developers/pricing                    (batch = 20% off; web search $5/1k)
//   DeepSeek    https://api-docs.deepseek.com/quick_start/pricing/      (off-peak = 50% off)
import { get } from '../db/index.ts';
import type { EngineId } from '../../../shared/types.ts';
import type { EngineUsage } from './types.ts';

export const PRICING_AS_OF = '2026-10-21';

interface Rate {
  /** USD per 1M tokens. */
  input: number;
  cachedInput: number;
  output: number;
  /** Multiplier on token cost for batch/flex processing (search fees are not discounted). */
  batchFactor: number;
  /** USD per web search / grounding call. */
  perSearch: number;
}

/** First matching model pattern wins; the last entry per engine is the conservative fallback for unknown models. */
const RATES: Record<EngineId, [RegExp, Rate][]> = {
  chatgpt: [
    [/^gpt-5-mini/, { input: 0.25, cachedInput: 0.025, output: 2.0, batchFactor: 0.5, perSearch: 0.01 }],
    [/./, { input: 2.0, cachedInput: 0.2, output: 12.0, batchFactor: 0.5, perSearch: 0.01 }],
  ],
  claude: [
    [/^claude-haiku-5/, { input: 0.1, cachedInput: 0.01, output: 0.5, batchFactor: 0.5, perSearch: 0.01 }],
    [/^claude-opus-5/, { input: 4.0, cachedInput: 0.2, output: 20.0, batchFactor: 0.5, perSearch: 0.01 }],
    [/^claude-fable/, { input: 10.0, cachedInput: 0.25, output: 50.0, batchFactor: 0.5, perSearch: 0.01 }],
    [/./, { input: 2.0, cachedInput: 0.2, output: 10.0, batchFactor: 0.5, perSearch: 0.01 }], // Sonnet 5.5
  ],
  gemini: [
    [/./, { input: 0.3, cachedInput: 0.03, output: 2.5, batchFactor: 0.5, perSearch: 0.035 }], // 2.5 Flash; per grounded prompt
  ],
  perplexity: [
    [/./, { input: 0.25, cachedInput: 0.0625, output: 2.5, batchFactor: 1, perSearch: 0.001 }],
  ],
  grok: [
    [/./, { input: 1.25, cachedInput: 0.2, output: 2.5, batchFactor: 0.8, perSearch: 0.005 }], // grok-4.3
  ],
  deepseek: [
    [/./, { input: 0.3, cachedInput: 0.006, output: 1.2, batchFactor: 1, perSearch: 0 }], // deepseek-flash, peak
  ],
};

const rateFor = (engine: EngineId, model: string): Rate => (RATES[engine].find(([re]) => re.test(model)) ?? RATES[engine].at(-1)!)[1];

/** Google waives grounding for the first 1,500 grounded prompts per day on the paid tier. */
const GEMINI_FREE_GROUNDED_PER_DAY = 1500;
function geminiGroundingFee(perPrompt: number): number {
  const today = new Date().toISOString().slice(0, 10);
  const used = get<{ n: number }>("SELECT COUNT(*) n FROM responses WHERE engine = 'gemini' AND day = ? AND search_calls > 0", [today])?.n ?? 0;
  return used >= GEMINI_FREE_GROUNDED_PER_DAY ? perPrompt : 0;
}

/** DeepSeek charges half outside its peak windows (01:00–04:00 and 06:00–10:00 UTC, Monday–Friday). */
function deepseekFactor(now = new Date()): number {
  const day = now.getUTCDay();
  const h = now.getUTCHours();
  const peak = day >= 1 && day <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
  return peak ? 1 : 0.5;
}

/** Estimated USD for one live call at list prices, after batch/flex and cache discounts. */
export function estimateCostUsd(engine: EngineId, model: string, u: EngineUsage, opts: { batch: boolean }): number {
  const r = rateFor(engine, model);
  const cached = Math.min(u.cachedTokens, u.inputTokens);
  let tokens = ((u.inputTokens - cached) * r.input + cached * r.cachedInput + u.outputTokens * r.output) / 1e6;
  if (opts.batch) tokens *= r.batchFactor;
  if (engine === 'deepseek') tokens *= deepseekFactor();
  const search = engine === 'gemini' ? (u.searchCalls > 0 ? geminiGroundingFee(r.perSearch) : 0) : u.searchCalls * r.perSearch;
  return Math.round((tokens + search) * 1e6) / 1e6;
}

/** What cached input tokens saved versus paying the full input price. */
export function savingsFromCacheUsd(engine: EngineId, model: string, cachedTokens: number, opts: { batch: boolean }): number {
  const r = rateFor(engine, model);
  return (cachedTokens * (r.input - r.cachedInput) / 1e6) * (opts.batch ? r.batchFactor : 1);
}

/** Typical usage of one buyer-prompt answer (search results dominate input), used for budget checks before a call. */
const TYPICAL_ANSWER: Record<EngineId, EngineUsage> = {
  chatgpt: { inputTokens: 9000, outputTokens: 500, cachedTokens: 0, searchCalls: 1 },
  claude: { inputTokens: 12000, outputTokens: 900, cachedTokens: 0, searchCalls: 2 },
  gemini: { inputTokens: 600, outputTokens: 1200, cachedTokens: 0, searchCalls: 1 },
  perplexity: { inputTokens: 4500, outputTokens: 400, cachedTokens: 0, searchCalls: 1 },
  grok: { inputTokens: 7500, outputTokens: 700, cachedTokens: 4000, searchCalls: 3 },
  deepseek: { inputTokens: 60, outputTokens: 700, cachedTokens: 0, searchCalls: 0 },
};
const TYPICAL_COMPLETION: EngineUsage = { inputTokens: 2000, outputTokens: 1500, cachedTokens: 0, searchCalls: 0 };

export function typicalCostUsd(engine: EngineId, model: string, opts: { batch: boolean; completion?: boolean }): number {
  return estimateCostUsd(engine, model, opts.completion ? TYPICAL_COMPLETION : TYPICAL_ANSWER[engine], { batch: opts.batch });
}
