// Claude via the official Anthropic SDK: realtime Messages API with server-side web search, plain completions,
// and the Message Batches API (50% off, results usually within an hour) for scheduled checks.
import Anthropic from '@anthropic-ai/sdk';
import { EngineHttpError, describeHttpError } from './http.ts';
import { NO_USAGE, addUsage, type BatchAdapter, type EngineCitation, type EngineUsage, type LiveProvider, type ProviderCtx, type SearchResult } from './types.ts';
import { SEARCH_INSTRUCTION, countryOf } from './shared.ts';

/** Answers to buying questions are a few hundred words; adaptive thinking at low effort needs a little headroom. */
const ANSWER_MAX_TOKENS = 3000;
/** Each search costs $10/1k plus its result tokens as input; two or three are enough for a recommendation answer. */
const MAX_SEARCHES = 3;
/** Server-tool loops may pause; resume a bounded number of times. */
const MAX_TURNS = 3;

/** Dynamic-filtering web search needs Opus/Sonnet 4.6+; other models get the basic tool version. */
const isModern = (model: string) => /^claude-(opus|sonnet)-(4-[6-9]|[5-9])/.test(model);
/** Models that accept the server-side refusal fallback in its "default" form (Claude API only, not in batches). */
const supportsFallback = (model: string) => /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/.test(model);

const clients = new Map<string, Anthropic>();
/** One client per key. Base URL and auth are explicit so ambient ANTHROPIC_* env vars on the host never apply. */
function client(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey, authToken: null, baseURL: 'https://api.anthropic.com', maxRetries: 1, timeout: 60_000 });
    clients.set(apiKey, c);
  }
  return c;
}

/** SDK errors → the same concise, redactable message format the fetch-based providers use. */
function asEngineError(err: unknown): never {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? null;
    throw new EngineHttpError(status ? describeHttpError(status, JSON.stringify(err.error ?? { message: err.message })) : `Request failed: ${err.message}`, status);
  }
  throw err;
}

function searchTool(model: string, market?: string) {
  const country = countryOf(market);
  return {
    type: isModern(model) ? ('web_search_20260209' as const) : ('web_search_20250305' as const),
    name: 'web_search' as const,
    max_uses: MAX_SEARCHES,
    ...(country ? { user_location: { type: 'approximate' as const, country } } : {}),
  };
}

const effort = (model: string) => (isModern(model) ? { output_config: { effort: 'low' as const } } : {});

/** Request body shared by realtime and batch calls (batch requests can't carry `fallbacks`). */
function searchParams(promptText: string, model: string, market: string | undefined, prior: Anthropic.ContentBlockParam[] = []) {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: promptText }];
  if (prior.length) messages.push({ role: 'assistant', content: prior });
  return {
    model,
    max_tokens: ANSWER_MAX_TOKENS,
    system: SEARCH_INSTRUCTION,
    messages,
    tools: [searchTool(model, market)],
    ...effort(model),
  };
}

interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** `input_tokens` excludes cache reads/writes; our `inputTokens` is the total so cost math has one convention. */
function usageOf(u: UsageLike | null | undefined): EngineUsage {
  if (!u) return NO_USAGE;
  const cached = u.cache_read_input_tokens ?? 0;
  return {
    inputTokens: (u.input_tokens ?? 0) + cached + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
    cachedTokens: cached,
    searchCalls: u.server_tool_use?.web_search_requests ?? 0,
  };
}

interface BlockLike {
  type: string;
  text?: string;
  citations?: { type: string; url?: string; title?: string | null }[] | null;
  content?: unknown;
}

function parseBlocks(blocks: BlockLike[]): { text: string; citations: EngineCitation[] } {
  let text = '';
  const cited: EngineCitation[] = [];
  const searched: EngineCitation[] = [];
  for (const b of blocks) {
    if (b.type === 'text' && b.text) {
      text += b.text;
      for (const c of b.citations ?? []) if (c.type === 'web_search_result_location' && c.url) cited.push({ url: c.url, title: c.title ?? '' });
    } else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      // Success content is a list of results; an error is a single object (skipped).
      for (const r of b.content as { type?: string; url?: string; title?: string }[]) {
        if (r.type === 'web_search_result' && r.url) searched.push({ url: r.url, title: r.title ?? '' });
      }
    }
  }
  // Prefer sources the answer actually cites; fall back to the top search results.
  return { text: text.trim(), citations: cited.length ? cited : searched.slice(0, 5) };
}

async function search(promptText: string, { apiKey, model, market }: ProviderCtx): Promise<SearchResult> {
  const blocks: Anthropic.ContentBlockParam[] = [];
  let usage = NO_USAGE;
  let served = model;
  const fallback = supportsFallback(model);
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await client(apiKey).beta.messages.create({
        ...searchParams(promptText, model, market, blocks),
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      served = res.model ?? served;
      usage = addUsage(usage, usageOf(res.usage as UsageLike));
      blocks.push(...(res.content as unknown as Anthropic.ContentBlockParam[]));
      if (res.stop_reason === 'refusal' && !res.content.some((b) => b.type === 'text')) throw new Error('Model declined to answer');
      if (res.stop_reason !== 'pause_turn') break;
    }
  } catch (err) {
    asEngineError(err);
  }
  return { ...parseBlocks(blocks as BlockLike[]), model: served, usage };
}

async function complete(req: { system?: string; prompt: string; maxTokens?: number }, { apiKey, model }: Omit<ProviderCtx, 'market'>) {
  // A long, stable system prompt (project context for drafts) is marked cacheable: repeat drafts within
  // 5 minutes read it at ~10% of the input price. Below the model's minimum it simply isn't cached.
  const system = req.system
    ? [{ type: 'text' as const, text: req.system, ...(req.system.length > 1800 ? { cache_control: { type: 'ephemeral' as const } } : {}) }]
    : undefined;
  try {
    const res = await client(apiKey).messages.create({
      model,
      max_tokens: (req.maxTokens ?? 2000) + 4000, // headroom for adaptive thinking
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: req.prompt }],
      ...effort(model),
    });
    if (res.stop_reason === 'refusal') throw new Error('Model declined to answer');
    return { text: parseBlocks(res.content as BlockLike[]).text, model: res.model ?? model, usage: usageOf(res.usage as UsageLike) };
  } catch (err) {
    asEngineError(err);
  }
}

const batch: BatchAdapter = {
  async submit(items, { apiKey, model, market }) {
    try {
      const b = await client(apiKey).messages.batches.create({
        requests: items.map((i) => ({ custom_id: i.customId, params: searchParams(i.promptText, model, market) })),
      });
      return b.id;
    } catch (err) {
      asEngineError(err);
    }
  },
  async check(batchId, { apiKey }) {
    try {
      const b = await client(apiKey).messages.batches.retrieve(batchId);
      return b.processing_status === 'ended' ? { state: 'ended' } : { state: 'pending' };
    } catch (err) {
      if (err instanceof Anthropic.NotFoundError) return { state: 'failed', error: 'Batch not found at Anthropic' };
      asEngineError(err);
    }
  },
  async results(batchId, { apiKey, model }) {
    const out = new Map<string, SearchResult | { error: string }>();
    try {
      for await (const r of await client(apiKey).messages.batches.results(batchId)) {
        const res = r.result;
        if (res.type === 'succeeded') {
          const parsed = parseBlocks(res.message.content as BlockLike[]);
          out.set(r.custom_id, parsed.text
            ? { ...parsed, model: res.message.model ?? model, usage: usageOf(res.message.usage as UsageLike) }
            : { error: res.message.stop_reason === 'pause_turn' ? 'Answer paused mid-search in the batch; re-check in real time' : 'Empty answer' });
        } else if (res.type === 'errored') {
          out.set(r.custom_id, { error: `Batch request failed: ${res.error.error?.type ?? 'error'} — ${res.error.error?.message ?? ''}`.slice(0, 300) });
        } else {
          out.set(r.custom_id, { error: res.type === 'expired' ? 'Batch request expired before it ran' : 'Batch request canceled' });
        }
      }
    } catch (err) {
      asEngineError(err);
    }
    return out;
  },
};

export const anthropicProvider: LiveProvider = { search, complete, batch };
