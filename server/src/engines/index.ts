// Engine entry point: live when the provider key is configured, otherwise simulated. Never throws.
import { dayOf, id, insert, nowIso } from '../db/index.ts';
import type { EngineId } from '../../../shared/types.ts';
import { assertBudget, BudgetError } from '../services/cost.ts';
import { engineKey, engineModel } from './catalog.ts';
import { estimateCostUsd, typicalCostUsd } from './pricing.ts';
import { PROVIDERS } from './providers.ts';
import { simulateAnswer } from './simulated.ts';
import type { AskContext, CompleteRequest, EngineAnswer, SearchResult } from './types.ts';

export type { AskContext, EngineAnswer, EngineCitation } from './types.ts';

/** Key-shaped tokens (OpenAI/Anthropic sk-…, xAI, Perplexity, Google AIza…) and key/token query parameters. */
const SECRET_RE = /\b(?:sk-[\w-]{8,}|xai-[\w-]{8,}|pplx-[\w-]{8,}|AIza[\w-]{20,})|([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"']+/gi;

/**
 * Error text that is safe to store and show (responses.error, logs): the configured key and anything key-shaped is
 * redacted, since provider and HTTP-client errors can echo request headers or URLs.
 */
export function redactSecrets(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join('[redacted]');
  return out.replace(SECRET_RE, (_m, param: string | undefined) => (param ? `${param}[redacted]` : '[redacted]'));
}

/** Stored answer errors are capped at 300 chars (describeHttpError already keeps provider errors concise). */
const errorMessage = (err: unknown, apiKey?: string) => redactSecrets(err instanceof Error ? err.message : String(err), [apiKey]).slice(0, 300);

/** A provider result as a stored live answer, with its estimated cost. */
export function liveAnswer(engine: EngineId, r: SearchResult, latencyMs: number | null, batch: boolean): EngineAnswer {
  // Batch API answers and discounted-tier answers (OpenAI flex) are both billed at batch token rates.
  const discounted = batch || !!r.discounted;
  return {
    text: r.text, citations: r.citations, model: r.model, mode: 'live', latencyMs, error: r.text ? null : 'Empty answer',
    usage: r.usage, costUsd: r.reportedCostUsd ?? estimateCostUsd(engine, r.model, r.usage, { batch: discounted }), batch: discounted,
  };
}

/** Ask an engine a buyer prompt. Failures (including a reached budget) are returned in `error`; never throws. */
export async function ask(engine: EngineId, promptText: string, ctx: AskContext): Promise<EngineAnswer> {
  const apiKey = engineKey(engine);
  // The demo brand is fictional: live engines would never name it, and every scheduled check would cost money.
  if (!apiKey || ctx.project.isDemo) return simulateAnswer(engine, promptText, ctx);
  const model = engineModel(engine);
  const failed = (error: string, latencyMs: number | null = null): EngineAnswer =>
    ({ text: '', citations: [], model, mode: 'live', latencyMs, error });
  try {
    assertBudget(typicalCostUsd(engine, model, { batch: !!ctx.economy }));
  } catch (err) {
    if (err instanceof BudgetError) return failed(err.message);
    throw err;
  }
  const started = Date.now();
  try {
    const r = await PROVIDERS[engine].search(promptText, { apiKey, model, market: ctx.project.market, economy: ctx.economy });
    return liveAnswer(engine, r, Date.now() - started, false);
  } catch (err) {
    return failed(errorMessage(err, apiKey), Date.now() - started);
  }
}

/**
 * Plain completion on a live engine (no web search) for drafts and suggestions. Its spend is logged in llm_usage and
 * counts toward the monthly budget. Returns null when the engine is not live, the budget is reached, or the call fails.
 */
export async function complete(engine: EngineId, req: CompleteRequest & { projectId?: string; purpose?: string }): Promise<{ text: string; model: string } | null> {
  const apiKey = engineKey(engine);
  if (!apiKey) return null;
  const model = engineModel(engine);
  try {
    assertBudget(typicalCostUsd(engine, model, { batch: false, completion: true }));
    const r = await PROVIDERS[engine].complete(req, { apiKey, model });
    insert('llm_usage', {
      id: id('use'), project_id: req.projectId ?? null, engine, model: r.model, purpose: req.purpose ?? 'completion',
      input_tokens: r.usage.inputTokens, output_tokens: r.usage.outputTokens, cached_tokens: r.usage.cachedTokens,
      cost_usd: estimateCostUsd(engine, r.model, r.usage, { batch: false }), day: dayOf(), created_at: nowIso(),
    });
    return r.text ? { text: r.text, model: r.model } : null;
  } catch (err) {
    console.warn(`[llm] ${engine} completion ${err instanceof BudgetError ? 'skipped' : 'failed'}: ${errorMessage(err, apiKey)}`);
    return null;
  }
}
