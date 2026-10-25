// Outbound fetch for audits/sitemaps: SSRF-safe (lib/safe-fetch.ts), timeout, redirect following, body size cap, never throws.
import { BlockedUrlError, safeFetch } from '../lib/safe-fetch.ts';

export const AUDIT_UA = 'AIVisibilityAudit/0.1 (+https://localhost)';

export interface FetchResult {
  ok: boolean;               // 2xx
  status: number | null;     // null when the request failed before a response
  url: string;               // final URL after redirects
  headers: Headers | null;
  contentType: string;
  body: string;
  bytes: number;
  truncated: boolean;
  ms: number;
  error: string | null;      // human-readable network error
}

function describeError(err: unknown, timeoutMs: number): string {
  if (err instanceof BlockedUrlError) return `Blocked: ${err.message}`;
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string } };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return `Timed out after ${Math.round(timeoutMs / 1000)}s`;
  const code = e?.code ?? e?.cause?.code ?? '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS lookup failed — the domain does not resolve';
  if (code === 'ECONNREFUSED') return 'Connection refused by the server';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return 'Connection timed out';
  if (code === 'ECONNRESET') return 'Connection reset by the server';
  if (code.startsWith('CERT_') || code.includes('SSL') || code.includes('TLS') || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code.startsWith('ERR_TLS'))
    return `TLS/certificate error (${code})`;
  if (code.startsWith('Z_') || code.includes('BROTLI')) return 'Response body could not be decompressed';
  return (e?.cause?.message ?? e?.message ?? 'Request failed').slice(0, 300);
}

function decoderFor(contentType: string): TextDecoder {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8');
  } catch {
    return new TextDecoder('utf-8');
  }
}

/**
 * GETs a URL as text through the SSRF-safe fetcher (public hosts only, every redirect hop re-checked).
 * Body is capped at `maxBytes` (rest is discarded, `truncated` set).
 */
export async function fetchText(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; accept?: string; raw?: boolean } = {},
): Promise<FetchResult & { rawBytes?: Uint8Array }> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const started = performance.now();
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: opts.maxBytes ?? 5 * 1024 * 1024,
      headers: { 'user-agent': AUDIT_UA, accept: opts.accept ?? 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8' },
    });
    const contentType = res.headers.get('content-type') ?? '';
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      url: res.url,
      headers: res.headers,
      contentType,
      body: opts.raw ? '' : decoderFor(contentType).decode(res.body),
      rawBytes: opts.raw ? res.body : undefined,
      bytes: res.bytes,
      truncated: res.truncated,
      ms: Math.round(performance.now() - started),
      error: null,
    };
  } catch (err) {
    return {
      ok: false, status: null, url, headers: null, contentType: '', body: '', bytes: 0, truncated: false,
      ms: Math.round(performance.now() - started), error: describeError(err, timeoutMs),
    };
  }
}

/** True when a "text file" response is actually an HTML page (SPA catch-all routes return 200 + index.html). */
export function looksLikeHtml(r: FetchResult): boolean {
  return /text\/html/i.test(r.contentType) || /^\s*(<!doctype html|<html)/i.test(r.body.slice(0, 200));
}
