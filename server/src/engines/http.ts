// JSON-over-HTTP helper for live engines: per-attempt timeout, one retry on 429/5xx/network errors.

const TIMEOUT_MS = 60_000;

export class EngineHttpError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ERROR_MAX = 300;

/**
 * Concise, human-readable provider error: `HTTP 401 · invalid_api_key — Incorrect API key provided…`.
 * Understands the OpenAI / Anthropic / Gemini / Perplexity / xAI / DeepSeek error envelopes; falls back to the
 * body's text (an HTML page's <title>). Never the raw JSON. Keys are redacted later by the caller (engines/index.ts).
 */
export function describeHttpError(status: number, body: string): string {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const e = (j.error && typeof j.error === 'object' ? j.error : j) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    message = str(e.message) ?? str(j.error) ?? str(j.message) ?? str(j.detail);
    // Machine codes only ("invalid_api_key", "authentication_error", "UNAUTHENTICATED"), not prose.
    code = [e.code, e.type, e.status, j.code].map(str).find((v) => !!v && /^[A-Za-z][\w.-]{1,59}$/.test(v) && v !== 'error');
  } catch {
    // Non-JSON (proxy/HTML error page): its <title>, else the text with tags stripped.
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1];
    message = (title ?? body.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 160) || undefined;
  }
  const head = [`HTTP ${status}`, code].filter(Boolean).join(' · ');
  const text = message ? `${head} — ${message.replace(/\s+/g, ' ')}` : head;
  return text.length > ERROR_MAX ? `${text.slice(0, ERROR_MAX - 1)}…` : text;
}

function retryDelayMs(res: Response | null, attempt: number): number {
  const header = res?.headers.get('retry-after');
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 20_000);
  return 1500 * 2 ** attempt + Math.floor(Math.random() * 500);
}

/** POST JSON and parse the JSON reply. Throws EngineHttpError with a short human-readable message (see describeHttpError). */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, retries = 1, timeoutMs = TIMEOUT_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (attempt < retries) {
        await sleep(retryDelayMs(null, attempt));
        continue;
      }
      const reason = err instanceof Error && err.name === 'TimeoutError' ? `timed out after ${timeoutMs / 1000}s` : String((err as Error)?.message ?? err);
      throw new EngineHttpError(`Request failed: ${reason}`, null);
    }
    if (res.ok) return (await res.json()) as T;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    throw new EngineHttpError(describeHttpError(res.status, await res.text().catch(() => '')), res.status);
  }
}

/** GET JSON with the same error handling as postJson (used to poll batch status). */
export async function getJson<T>(url: string, headers: Record<string, string>, timeoutMs = TIMEOUT_MS): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new EngineHttpError(`Request failed: ${String((err as Error)?.message ?? err)}`, null);
  }
  if (!res.ok) throw new EngineHttpError(describeHttpError(res.status, await res.text().catch(() => '')), res.status);
  return (await res.json()) as T;
}
