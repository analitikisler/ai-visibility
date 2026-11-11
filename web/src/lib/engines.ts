// Engine metadata for the UI. Engine colors are the kit's categorical series and are only for engine-series charts
// (never on the same chart as competitor series). The four default engines take cat-2…5, so cat-1 (the brand) is last.
import type { EngineId } from '@shared/types';
import { copy, fmt } from '@/content/copy';

export interface EngineMeta {
  id: EngineId;
  name: string;
  vendor: string;
  /** CSS color for engine-series marks, e.g. `var(--color-data-cat-2)`. */
  color: string;
  /** Tailwind class pair for a swatch dot (`bg-cat-2`). */
  dotClass: string;
}

export const ENGINE_IDS: EngineId[] = ['chatgpt', 'claude', 'gemini', 'perplexity', 'grok', 'deepseek'];

export const ENGINES: Record<EngineId, EngineMeta> = {
  chatgpt: { id: 'chatgpt', name: 'ChatGPT', vendor: 'OpenAI', color: 'var(--color-data-cat-2)', dotClass: 'bg-cat-2' },
  claude: { id: 'claude', name: 'Claude', vendor: 'Anthropic', color: 'var(--color-data-cat-3)', dotClass: 'bg-cat-3' },
  gemini: { id: 'gemini', name: 'Gemini', vendor: 'Google', color: 'var(--color-data-cat-4)', dotClass: 'bg-cat-4' },
  perplexity: { id: 'perplexity', name: 'Perplexity', vendor: 'Perplexity', color: 'var(--color-data-cat-5)', dotClass: 'bg-cat-5' },
  grok: { id: 'grok', name: 'Grok', vendor: 'xAI', color: 'var(--color-data-cat-6)', dotClass: 'bg-cat-6' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', vendor: 'DeepSeek', color: 'var(--color-data-cat-1)', dotClass: 'bg-cat-1' },
};

export function isEngineId(v: unknown): v is EngineId {
  return typeof v === 'string' && (ENGINE_IDS as string[]).includes(v);
}

export const engineName = (id: EngineId | string) => (isEngineId(id) ? ENGINES[id].name : id);
export const engineColor = (id: EngineId | string) => (isEngineId(id) ? ENGINES[id].color : 'var(--color-muted)');

export interface EngineErrorView {
  /** One plain sentence with the way out ("ChatGPT rejected the API key. Paste a new key…"). */
  message: string;
  /** Status and provider code for the detail line (`HTTP 401 · invalid_api_key`), or a short raw excerpt. */
  detail: string | null;
}

/**
 * Turns a raw engine/run error ("chatgpt: HTTP 401: { "error": { … } }" or "N of M jobs failed: …") into
 * Error copy: what happened in plain words first, codes in a detail line, never raw JSON.
 */
export function describeEngineError(raw: string | null | undefined, engine?: EngineId | string): EngineErrorView {
  const text = (raw ?? '').replace(/^\d+ of \d+ jobs failed:\s*/, '');
  const m = /^([a-z]+):\s*/.exec(text);
  const id = engine ?? (m && isEngineId(m[1]) ? m[1] : undefined);
  const name = id ? engineName(id) : 'The engine';
  const status = Number(/HTTP (\d{3})/.exec(text)?.[1] ?? 0) || null;
  // Server stores "HTTP 401 · invalid_api_key — message"; older rows may hold raw JSON bodies.
  const code = /HTTP \d{3} · ([\w.-]+)/.exec(text)?.[1] ?? /"(?:code|type)"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? null;
  const E = copy.app.engineErrors;
  const key =
    status === 401 || status === 403 || /invalid_api_key|authentication|api key/i.test(text)
      ? E.keyRejected
      : status === 429 || /rate.?limit|quota|insufficient/i.test(text)
        ? E.rateLimited
        : status && status >= 500
          ? E.serverError
          : /timeout|timed out|aborted/i.test(text)
            ? E.timeout
            : E.generic;
  const excerpt = text.replace(/^[a-z]+:\s*/, '').replace(/\s+/g, ' ').trim();
  const detail = status ? [`HTTP ${status}`, code].filter(Boolean).join(' · ') : excerpt ? (excerpt.length > 140 ? `${excerpt.slice(0, 139)}…` : excerpt) : null;
  return { message: fmt(key, { engine: name }), detail };
}
