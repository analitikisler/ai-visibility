// Live provider adapters (plain fetch; Claude uses the official SDK in anthropic.ts). Each answers a buyer prompt the
// way the consumer product would (with web search/grounding where the API offers it), reports billable usage, and
// exposes a plain completion for lib/llm.ts. Cost levers per provider are noted inline (see also engines/pricing.ts).
import type { EngineId } from '../../../shared/types.ts';
import { anthropicProvider } from './anthropic.ts';
import { EngineHttpError, getJson, postJson } from './http.ts';
import { SEARCH_INSTRUCTION, countryOf, n } from './shared.ts';
import { NO_USAGE, type BatchAdapter, type EngineCitation, type EngineUsage, type LiveProvider, type SearchResult } from './types.ts';

// ---------------------------------------------------------------- Responses-style output (OpenAI, xAI, Perplexity)

interface ResponsesOutput {
  type: string;
  content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
  results?: { url?: string; title?: string }[];
}
interface ResponsesBody { model?: string; output?: ResponsesOutput[] }

/** Answer text, `url_citation` annotations and `search_results` items from a Responses-API output list. */
function parseResponses(res: ResponsesBody): { text: string; citations: EngineCitation[]; searchCalls: number } {
  const parts: string[] = [];
  const cited: EngineCitation[] = [];
  const results: EngineCitation[] = [];
  let searchCalls = 0;
  for (const item of res.output ?? []) {
    if (item.type === 'web_search_call') searchCalls++;
    if (item.type === 'search_results') for (const r of item.results ?? []) if (r.url) results.push({ url: r.url, title: r.title ?? '' });
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type !== 'output_text' || !c.text) continue;
      parts.push(c.text);
      for (const a of c.annotations ?? []) if (a.type === 'url_citation' && a.url) cited.push({ url: a.url, title: a.title && !/^\d+$/.test(a.title) ? a.title : '' });
    }
  }
  return { text: parts.join('\n\n').trim(), citations: cited.length ? cited : results, searchCalls };
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number; cache_read_input_tokens?: number };
}
const responsesUsage = (u: ResponsesUsage | undefined, searchCalls: number): EngineUsage => ({
  inputTokens: n(u?.input_tokens),
  outputTokens: n(u?.output_tokens),
  cachedTokens: n(u?.input_tokens_details?.cached_tokens ?? u?.input_tokens_details?.cache_read_input_tokens),
  searchCalls,
});

// ---------------------------------------------------------------- OpenAI (Responses API + web search)

const isOpenAiReasoning = (model: string) => /^(gpt-5|o\d)/.test(model);
/** Flex processing bills tokens at Batch rates but can be slow or briefly unavailable (429, not charged). */
const FLEX_TIMEOUT_MS = 10 * 60_000;
const OPENAI_RESPONSES = 'https://api.openai.com/v1/responses';

const openai: LiveProvider = {
  async search(promptText, { apiKey, model, market, economy }) {
    const country = countryOf(market);
    const body = {
      model,
      instructions: SEARCH_INSTRUCTION,
      input: promptText,
      tools: [{ type: 'web_search', ...(country ? { user_location: { type: 'approximate', country } } : {}) }],
      // Each search is $10/1k plus its content tokens; two are plenty for a recommendation answer.
      max_tool_calls: 2,
      ...(isOpenAiReasoning(model) ? { reasoning: { effort: 'low' } } : {}),
    };
    const headers = { authorization: `Bearer ${apiKey}` };
    type Res = ResponsesBody & { usage?: ResponsesUsage; service_tier?: string };
    let res: Res;
    try {
      // OpenAI's Batch API doesn't support web search, so cost-saving runs use the flex tier instead.
      res = economy ? await postJson<Res>(OPENAI_RESPONSES, { ...body, service_tier: 'flex' }, headers, 0, FLEX_TIMEOUT_MS)
        : await postJson<Res>(OPENAI_RESPONSES, body, headers);
    } catch (err) {
      // No flex capacity right now (429, not charged): answer at the standard tier rather than fail the check.
      if (!(economy && err instanceof EngineHttpError && err.status === 429)) throw err;
      res = await postJson<Res>(OPENAI_RESPONSES, body, headers);
    }
    const parsed = parseResponses(res);
    return {
      text: parsed.text, citations: parsed.citations, model: res.model ?? model, usage: responsesUsage(res.usage, parsed.searchCalls),
      discounted: res.service_tier === 'flex',
    };
  },
  async complete(req, { apiKey, model }) {
    const reasoning = isOpenAiReasoning(model);
    const res = await postJson<ResponsesBody & { usage?: ResponsesUsage }>(OPENAI_RESPONSES, {
      model,
      ...(req.system ? { instructions: req.system } : {}),
      input: req.prompt,
      max_output_tokens: (req.maxTokens ?? 2000) + (reasoning ? 4000 : 0),
      ...(reasoning ? { reasoning: { effort: 'low' } } : {}),
      // Routes repeat drafts for one project to the same prompt cache (automatic caching, ~90% off cached input).
      ...(req.cacheKey ? { prompt_cache_key: req.cacheKey } : {}),
    }, { authorization: `Bearer ${apiKey}` });
    return { text: parseResponses(res).text, model: res.model ?? model, usage: responsesUsage(res.usage, 0) };
  },
};

// ---------------------------------------------------------------- xAI Grok (Responses API + web search)

interface XaiUsage extends ResponsesUsage {
  cost_in_usd_ticks?: number;
  server_side_tool_usage_details?: { web_search_calls?: number };
}
/** xAI reports exact cost in ticks of 1e-10 USD. */
const ticksToUsd = (ticks: number | undefined) => (typeof ticks === 'number' && ticks >= 0 ? ticks / 1e10 : undefined);

const xai: LiveProvider = {
  async search(promptText, { apiKey, model }) {
    const res = await postJson<ResponsesBody & { usage?: XaiUsage }>('https://api.x.ai/v1/responses', {
      model, instructions: SEARCH_INSTRUCTION, input: promptText, tools: [{ type: 'web_search' }], reasoning: { effort: 'low' },
    }, { authorization: `Bearer ${apiKey}` }, 1, 120_000);
    const parsed = parseResponses(res);
    const searches = res.usage?.server_side_tool_usage_details?.web_search_calls ?? parsed.searchCalls;
    const cost = ticksToUsd(res.usage?.cost_in_usd_ticks);
    return {
      text: parsed.text, citations: parsed.citations, model: res.model ?? model, usage: responsesUsage(res.usage, n(searches)),
      ...(cost !== undefined ? { reportedCostUsd: cost } : {}),
    };
  },
  async complete(req, { apiKey, model }) {
    const res = await postJson<ResponsesBody & { usage?: XaiUsage }>('https://api.x.ai/v1/responses', {
      model, ...(req.system ? { instructions: req.system } : {}), input: req.prompt, reasoning: { effort: 'low' },
      ...(req.maxTokens ? { max_output_tokens: req.maxTokens + 4000 } : {}),
      ...(req.cacheKey ? { prompt_cache_key: req.cacheKey } : {}),
    }, { authorization: `Bearer ${apiKey}` });
    return { text: parseResponses(res).text, model: res.model ?? model, usage: responsesUsage(res.usage, 0) };
  },
};

// ---------------------------------------------------------------- Perplexity (Agent API; Sonar chat completions ended 2026-09-27)

interface PplxUsage extends ResponsesUsage {
  cost?: { total_cost?: number };
  tool_calls_details?: { search_web?: { invocation?: number } };
}

const perplexity: LiveProvider = {
  async search(promptText, { apiKey, model }) {
    const res = await postJson<ResponsesBody & { usage?: PplxUsage }>('https://api.perplexity.ai/v1/agent', {
      model, input: promptText,
      // 'fast' search is $1/1k instead of $2.50/1k; five results are enough to rank vendors.
      tools: [{ type: 'web_search', search_type: 'fast', max_results: 5 }],
    }, { authorization: `Bearer ${apiKey}` });
    const parsed = parseResponses(res);
    const searches = res.usage?.tool_calls_details?.search_web?.invocation ?? (parsed.citations.length ? 1 : 0);
    const cost = res.usage?.cost?.total_cost;
    return {
      text: parsed.text, citations: parsed.citations, model: res.model ?? model, usage: responsesUsage(res.usage, n(searches)),
      ...(typeof cost === 'number' ? { reportedCostUsd: cost } : {}),
    };
  },
  async complete(req, { apiKey, model }) {
    const res = await postJson<ResponsesBody & { usage?: PplxUsage }>('https://api.perplexity.ai/v1/agent', {
      model, ...(req.system ? { instructions: req.system } : {}), input: req.prompt,
      ...(req.maxTokens ? { max_output_tokens: req.maxTokens } : {}),
    }, { authorization: `Bearer ${apiKey}` });
    return { text: parseResponses(res).text, model: res.model ?? model, usage: responsesUsage(res.usage, 0) };
  },
};

// ---------------------------------------------------------------- Gemini (generateContent + Google Search grounding; batch mode)

interface GeminiCandidate {
  content?: { parts?: { text?: string; thought?: boolean }[] };
  groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[]; webSearchQueries?: string[] };
}
interface GeminiUsage {
  promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number; cachedContentTokenCount?: number;
}
interface GeminiResponse { modelVersion?: string; candidates?: GeminiCandidate[]; usageMetadata?: GeminiUsage }

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const geminiText = (res: GeminiResponse) =>
  (res.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
/** Thinking tokens bill as output; tool-use prompt tokens (grounding context) bill as input. */
const geminiUsage = (u: GeminiUsage | undefined, searches: number): EngineUsage => ({
  inputTokens: n(u?.promptTokenCount) + n(u?.toolUsePromptTokenCount),
  outputTokens: n(u?.candidatesTokenCount) + n(u?.thoughtsTokenCount),
  cachedTokens: n(u?.cachedContentTokenCount),
  searchCalls: searches,
});

/** Grounding chunks point at a Google redirect; resolve the real URL (fallback: the title, which is the domain). */
async function resolveGrounding(uri: string, title: string): Promise<EngineCitation> {
  const fromTitle = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title) ? `https://${title}/` : uri;
  let host = '';
  try {
    host = new URL(uri).hostname;
  } catch {
    return { url: fromTitle, title };
  }
  // Only Google's own redirector is contacted (never an arbitrary URL from the response).
  if (host !== 'vertexaisearch.cloud.google.com') return { url: uri, title };
  try {
    const res = await fetch(uri, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const location = res.headers.get('location');
    return { url: location && /^https?:\/\//.test(location) ? location : fromTitle, title };
  } catch {
    return { url: fromTitle, title };
  }
}

const geminiRequest = (promptText: string) => ({
  contents: [{ role: 'user', parts: [{ text: promptText }] }],
  tools: [{ google_search: {} }],
});

async function geminiResult(res: GeminiResponse, model: string): Promise<SearchResult> {
  const cand = res.candidates?.[0];
  const chunks = (cand?.groundingMetadata?.groundingChunks ?? []).slice(0, 8);
  const citations = await Promise.all(chunks.filter((c) => c.web?.uri).map((c) => resolveGrounding(c.web!.uri!, c.web!.title ?? '')));
  return { text: geminiText(res), citations, model: res.modelVersion ?? model, usage: geminiUsage(res.usageMetadata, cand?.groundingMetadata?.webSearchQueries?.length ?? 0) };
}

interface GeminiInline { response?: GeminiResponse; error?: { message?: string }; metadata?: { key?: string } }
type InlineBox = { inlinedResponses?: GeminiInline[] } | GeminiInline[];
interface GeminiBatch {
  name?: string;
  metadata?: { state?: string; output?: { inlinedResponses?: InlineBox } };
  state?: string;
  error?: { message?: string };
  response?: { inlinedResponses?: InlineBox };
  dest?: { inlinedResponses?: InlineBox };
}

/** The docs show inline results in a few places (response / dest / metadata.output); accept each. */
const inlined = (b: GeminiBatch): GeminiInline[] => {
  const box = b.response?.inlinedResponses ?? b.dest?.inlinedResponses ?? b.metadata?.output?.inlinedResponses;
  return Array.isArray(box) ? box : box?.inlinedResponses ?? [];
};

/** Gemini batch mode: 50% off tokens; Google Search grounding works inside batch requests. */
const geminiBatch: BatchAdapter = {
  async submit(items, { apiKey, model }) {
    const res = await postJson<GeminiBatch>(`${GEMINI}/models/${encodeURIComponent(model)}:batchGenerateContent`, {
      batch: {
        display_name: `ai-visibility-${Date.now()}`,
        input_config: { requests: { requests: items.map((i) => ({ request: geminiRequest(i.promptText), metadata: { key: i.customId } })) } },
      },
    }, { 'x-goog-api-key': apiKey });
    if (!res.name) throw new Error('Gemini did not return a batch name');
    return res.name;
  },
  async check(batchId, { apiKey }) {
    const b = await getJson<GeminiBatch>(`${GEMINI}/${batchId}`, { 'x-goog-api-key': apiKey });
    const state = b.metadata?.state ?? b.state ?? '';
    if (/SUCCEEDED/.test(state)) return { state: 'ended' };
    if (/FAILED|CANCELLED|EXPIRED/.test(state)) {
      return { state: 'failed', error: `Gemini batch ${state.replace(/^(BATCH|JOB)_STATE_/, '').toLowerCase()}${b.error?.message ? `: ${b.error.message}` : ''}` };
    }
    return { state: 'pending' };
  },
  async results(batchId, { apiKey, model }) {
    const b = await getJson<GeminiBatch>(`${GEMINI}/${batchId}`, { 'x-goog-api-key': apiKey });
    const out = new Map<string, SearchResult | { error: string }>();
    for (const item of inlined(b)) {
      const key = item.metadata?.key;
      if (!key) continue;
      if (item.response) {
        const r = await geminiResult(item.response, model);
        out.set(key, r.text ? r : { error: 'Empty answer' });
      } else out.set(key, { error: `Batch request failed: ${item.error?.message ?? 'unknown error'}`.slice(0, 300) });
    }
    return out;
  },
};

const gemini: LiveProvider = {
  async search(promptText, { apiKey, model }) {
    const res = await postJson<GeminiResponse>(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, geminiRequest(promptText), { 'x-goog-api-key': apiKey });
    return geminiResult(res, model);
  },
  async complete(req, { apiKey, model }) {
    const res = await postJson<GeminiResponse>(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: {
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens + 4000 } : {}), // thinking tokens count toward the cap
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    }, { 'x-goog-api-key': apiKey });
    return { text: geminiText(res), model: res.modelVersion ?? model, usage: geminiUsage(res.usageMetadata, 0) };
  },
  batch: geminiBatch,
};

// ---------------------------------------------------------------- DeepSeek (chat completions, no built-in search)

interface DeepSeekResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
}
const deepseekUsage = (u: DeepSeekResponse['usage']): EngineUsage =>
  u ? { inputTokens: n(u.prompt_tokens), outputTokens: n(u.completion_tokens), cachedTokens: n(u.prompt_cache_hit_tokens), searchCalls: 0 } : NO_USAGE;

const deepseek: LiveProvider = {
  async search(promptText, { apiKey, model }) {
    // The API has no web-search tool, so answers come from the model's own knowledge. Thinking off keeps it cheap.
    const res = await postJson<DeepSeekResponse>('https://api.deepseek.com/chat/completions', {
      model, messages: [{ role: 'user', content: promptText }], thinking: { type: 'disabled' },
    }, { authorization: `Bearer ${apiKey}` });
    return { text: res.choices?.[0]?.message?.content ?? '', citations: [], model: res.model ?? model, usage: deepseekUsage(res.usage) };
  },
  async complete(req, { apiKey, model }) {
    const messages = [...(req.system ? [{ role: 'system', content: req.system }] : []), { role: 'user', content: req.prompt }];
    const res = await postJson<DeepSeekResponse>('https://api.deepseek.com/chat/completions', {
      model, messages, thinking: { type: 'disabled' }, ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    }, { authorization: `Bearer ${apiKey}` });
    return { text: res.choices?.[0]?.message?.content ?? '', model: res.model ?? model, usage: deepseekUsage(res.usage) };
  },
};

export const PROVIDERS: Record<EngineId, LiveProvider> = {
  chatgpt: openai,
  claude: anthropicProvider,
  gemini,
  perplexity,
  grok: xai,
  deepseek,
};
