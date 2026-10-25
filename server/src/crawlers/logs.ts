// Access-log parsing: Nginx/Apache "combined" (optionally vhost-prefixed) and JSON lines.
import { normalizePath, normalizeTs, recordHits, type Hit } from './record.ts';

/** Upload cap shared by the in-app (project) and public (siteKey) log endpoints. */
export const MAX_LOG_BYTES = 20 * 1024 * 1024;
export const LOG_TOO_LARGE = 'Log upload exceeds 20 MB — split it or filter to bot lines first';
/** Log lines older than this are skipped (the longest dashboard range is 365 days). */
const MAX_LOG_AGE_DAYS = 366;

// [vhost] ip ident user [time] "METHOD target PROTO" status bytes "referer" "user-agent" ...
const COMBINED_RE =
  /^(?:\S+\s+)?(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([A-Z]+)\s+(\S+)[^"]*"\s+(\d{3}|-)\s+(?:\d+|-)(?:\s+"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)")?(.*)$/;
/** Last quoted field after the UA — the snippet's optional log_format appends "$http_signature_agent" there. */
const TRAILING_FIELD_RE = /"((?:[^"\\]|\\.)*)"\s*$/;
const CLF_TIME_RE = /^(\d{1,2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/;
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parses "10/Oct/2000:13:55:36 -0700" (CLF), ISO strings and epoch numbers (s/ms/µs/ns) to ISO, or null. */
export function parseLogTime(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const asNum = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isNaN(asNum)) {
    const ms = asNum > 1e17 ? asNum / 1e6 : asNum > 1e14 ? asNum / 1e3 : asNum > 1e11 ? asNum : asNum * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw !== 'string') return null;
  const m = CLF_TIME_RE.exec(raw.trim());
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (month === undefined) return null;
    let t = Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
    if (m[7]) t -= (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) * 60_000;
    return new Date(t).toISOString();
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const unescapeNginx = (s: string) => s.replace(/\\x([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1');
const dash = (s: string | undefined) => (!s || s === '-' ? '' : s);

function parseCombined(line: string): Hit | null {
  const m = COMBINED_RE.exec(line);
  if (!m) return null;
  const ts = parseLogTime(m[2]);
  if (!ts) return null;
  const target = m[4]!;
  const trailing = m[8] ? TRAILING_FIELD_RE.exec(m[8])?.[1] : undefined;
  return {
    ts,
    ip: dash(m[1]),
    path: normalizePath(target),
    url: target,
    status: m[5] === '-' ? null : Number(m[5]),
    referrer: unescapeNginx(dash(m[6])),
    userAgent: unescapeNginx(dash(m[7])),
    signatureAgent: trailing ? unescapeNginx(dash(trailing)) || undefined : undefined,
  };
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

const UA_KEYS = ['userAgent', 'user_agent', 'http_user_agent', 'user-agent', 'ua', 'agent', 'ClientRequestUserAgent'];
const PATH_KEYS = ['path', 'url', 'uri', 'request_uri', 'requestUri', 'ClientRequestURI', 'ClientRequestPath', 'request'];
const IP_KEYS = ['ip', 'remote_addr', 'remoteAddr', 'client_ip', 'clientIp', 'ClientIP', 'remote_ip'];
const STATUS_KEYS = ['status', 'status_code', 'statusCode', 'EdgeResponseStatus', 'OriginResponseStatus'];
const TS_KEYS = ['ts', 'time', 'timestamp', '@timestamp', 'time_iso8601', 'time_local', 'date', 'EdgeStartTimestamp'];
const REF_KEYS = ['referer', 'referrer', 'http_referer', 'http_referrer', 'ClientRequestReferer'];
const SIG_KEYS = ['signatureAgent', 'signature_agent', 'http_signature_agent', 'signature-agent'];

function parseJsonLine(line: string): Hit | null {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const rec = o as Record<string, unknown>;
  const userAgent = str(pick(rec, UA_KEYS));
  const signatureAgent = str(pick(rec, SIG_KEYS)) || undefined;
  let target = str(pick(rec, PATH_KEYS));
  // `request` may be the full request line: "GET /path HTTP/1.1"
  const reqLine = /^[A-Z]+\s+(\S+)/.exec(target);
  if (reqLine) target = reqLine[1]!;
  if (!userAgent && !target && !signatureAgent) return null;
  const status = Number(pick(rec, STATUS_KEYS));
  return {
    ts: parseLogTime(pick(rec, TS_KEYS)) ?? new Date().toISOString(),
    ip: str(pick(rec, IP_KEYS)),
    path: normalizePath(target),
    url: target || undefined,
    status: Number.isFinite(status) && status > 0 ? status : null,
    referrer: str(pick(rec, REF_KEYS)),
    userAgent,
    signatureAgent,
  };
}

/** Parses log text line by line. Lines in neither format, or stamped outside the accepted window, are counted as skipped. */
export function parseLogText(text: string): { hits: Hit[]; skipped: number } {
  const hits: Hit[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const hit = line.startsWith('{') ? parseJsonLine(line) : parseCombined(line);
    const ts = hit ? normalizeTs(hit.ts, MAX_LOG_AGE_DAYS) : null;
    if (hit && ts) hits.push({ ...hit, ts });
    else skipped++;
  }
  return { hits, skipped };
}

export type LogUploadResult =
  | { ok: true; parsed: number; botEvents: number; referralEvents: number; skipped: number; duplicates: number; ignored: number }
  | { ok: false; error: string; parsed: number; skipped: number };

/**
 * Parses an uploaded log body and stores bot/referral hits with content-derived ids, so re-uploading overlapping
 * logs is idempotent. Accepts raw text, JSON lines, or a JSON body {"log": "..."}.
 */
export function ingestLogUpload(projectId: string, body: string, contentType: string): LogUploadResult {
  let text = body;
  if (contentType.includes('application/json')) {
    try {
      const j = JSON.parse(text) as unknown;
      if (j && typeof j === 'object' && typeof (j as { log?: unknown }).log === 'string') text = (j as { log: string }).log;
    } catch {
      /* JSON lines — keep raw text */
    }
  }
  if (!text.trim()) return { ok: false, error: 'Empty log: send access-log text (text/plain) or {"log": "..."}', parsed: 0, skipped: 0 };
  const { hits, skipped } = parseLogText(text);
  if (!hits.length) return { ok: false, error: 'No parseable lines — expected Nginx/Apache combined format or JSON lines', parsed: 0, skipped };
  const r = recordHits(projectId, hits, 'log_upload', { dedupe: true });
  return { ok: true, parsed: hits.length, botEvents: r.bots, referralEvents: r.referrals, skipped, duplicates: r.duplicates, ignored: r.ignored };
}
