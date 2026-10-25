// IP verification for AI crawler hits. Anyone can send "GPTBot" as a user agent, so a hit whose UA names a catalog
// agent is checked against the IP ranges that agent's operator publishes (AiAgent.ipRangesUrl).
//
// bot_events.verified (no schema change, the column already exists):
//    1  verified    the IP is inside the matched agent's published ranges
//    0  unverified  no IP, an internal (proxy) IP, no published list, or the list isn't loaded yet
//   -1  spoofed     IP present, list loaded, IP outside it: the UA claims a bot it isn't
//
// Lists are fetched with safeFetch, held in memory and persisted in `settings` (key `iprange:<url>`) so restarts work
// offline; they refresh every 24 h in the background. Ingestion only reads the in-memory cache and never waits on the
// network. Rows stored unverified because a list wasn't loaded yet are re-checked (last 7 days) whenever lists load.
// A verdict, once given, is kept: lists change over time and a hit is judged against the list of its day.
import { BlockList, isIP } from 'node:net';
import { all, daysAgo, db, getSetting, nowIso, parseJson, setSetting, tx } from '../db/index.ts';
import { safeFetch } from '../lib/safe-fetch.ts';
import type { BotVerification } from '../../../shared/types.ts';
import { agentCatalog } from './catalog.ts';

export const VERIFIED = 1;
export const UNVERIFIED = 0;
export const SPOOFED = -1;
export type VerifiedCode = typeof VERIFIED | typeof UNVERIFIED | typeof SPOOFED;

export const VERIFICATION_CODES: Record<BotVerification, VerifiedCode> = { verified: VERIFIED, unverified: UNVERIFIED, spoofed: SPOOFED };

export function verificationOf(code: number): BotVerification {
  return code === VERIFIED ? 'verified' : code === SPOOFED ? 'spoofed' : 'unverified';
}

const SETTING_PREFIX = 'iprange:';
const REFRESH_MS = 24 * 3600_000;
/** Background tick: stale lists are refetched; failed fetches back off 1 h, 2 h, 4 h … up to 24 h. */
const TICK_MS = 3600_000;
const BACKFILL_DAYS = 7;
const BACKFILL_CHUNK = 2000;
const MAX_LIST_BYTES = 2 * 1024 * 1024;
const MAX_PREFIXES = 20_000;
const USER_AGENT = 'ai-visibility/0.1 (+https://analitikisler.com; AI crawler IP verification)';

type Family = 'ipv4' | 'ipv6';
interface RangeList { prefixes: string[]; fetchedAt: string; list: BlockList }

const lists = new Map<string, RangeList>();
const failures = new Map<string, { count: number; retryAt: number }>();
let urlByAgent: Map<string, string> | null = null;
let loaded = false;

/** agent id → its published list URL (several Google agents share one list). */
function agentUrls(): Map<string, string> {
  urlByAgent ??= new Map(agentCatalog().flatMap((a) => (a.ipRangesUrl ? [[a.id, a.ipRangesUrl] as [string, string]] : [])));
  return urlByAgent;
}

const rangeUrls = () => [...new Set(agentUrls().values())];

/** "a.b.c.d/n", "x:y::/n" or a bare address → [network, prefix length, family]; null when malformed. */
function parsePrefix(raw: string): [string, number, Family] | null {
  const m = /^([0-9a-f:.]+)(?:\/(\d{1,3}))?$/i.exec(raw.trim());
  const v = m ? isIP(m[1]!) : 0;
  if (!m || !v) return null;
  const max = v === 4 ? 32 : 128;
  const len = m[2] === undefined ? max : Number(m[2]);
  return len <= max ? [m[1]!, len, v === 4 ? 'ipv4' : 'ipv6'] : null;
}

/**
 * Prefixes from a published list. Every operator in the catalog uses Google's shape,
 * `{"prefixes": [{"ipv4Prefix": "…"} | {"ipv6Prefix": "…"}]}` (checked Oct 2026); other shapes (a bare array,
 * `{"ranges": […]}`, plain text with one CIDR per line) still work because every string that parses as a prefix counts.
 */
export function parseRanges(body: string): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    if (out.size < MAX_PREFIXES && parsePrefix(s)) out.add(s.trim());
  };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    for (const token of body.split(/[\s,;]+/)) if (token) add(token);
    return [...out];
  }
  const walk = (v: unknown, depth: number): void => {
    if (typeof v === 'string') add(v);
    else if (depth < 6 && Array.isArray(v)) for (const x of v) walk(x, depth + 1);
    else if (depth < 6 && v && typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(json, 0);
  return [...out];
}

function buildList(prefixes: string[]): BlockList {
  const list = new BlockList();
  for (const p of prefixes) {
    const parsed = parsePrefix(p);
    if (parsed) list.addSubnet(...parsed);
  }
  return list;
}

/** Addresses that mean the integration saw a proxy or load balancer, not the client: verifiable neither way. */
const INTERNAL = new BlockList();
for (const [net, len] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]] as const) {
  INTERNAL.addSubnet(net, len, 'ipv4');
}
for (const [net, len] of [['::', 127], ['fc00::', 7], ['fe80::', 10]] as const) INTERNAL.addSubnet(net, len, 'ipv6');

/**
 * The client address in a stored IP field: first entry of a forwarded list, without brackets, port or zone id;
 * IPv4-mapped IPv6 (`::ffff:1.2.3.4`, what Node's req.ip gives on dual-stack sockets) becomes plain IPv4.
 */
export function normalizeIp(raw: string): { ip: string; family: Family } | null {
  let s = (raw.split(',')[0] ?? '').trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracketed) s = bracketed[1]!;
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(':'));
  s = s.replace(/%.*$/, '').replace(/^::ffff:(?=\d{1,3}(?:\.\d{1,3}){3}$)/i, '');
  const v = isIP(s);
  return v ? { ip: s, family: v === 4 ? 'ipv4' : 'ipv6' } : null;
}

/** Loads persisted lists once (synchronous, so scripts and the first ingestion after a restart see them). */
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  for (const url of rangeUrls()) {
    const saved = parseJson<{ fetchedAt?: string; prefixes?: string[] } | null>(getSetting(SETTING_PREFIX + url), null);
    if (saved?.fetchedAt && saved.prefixes?.length) lists.set(url, { prefixes: saved.prefixes, fetchedAt: saved.fetchedAt, list: buildList(saved.prefixes) });
  }
}

function listFor(agentId: string): RangeList | null {
  const url = agentUrls().get(agentId);
  if (!url) return null;
  ensureLoaded();
  return lists.get(url) ?? null;
}

/** Verdicts by list + raw IP. Crawlers reuse a small pool of IPs, and BlockList scans its rules linearly (~2 µs). */
const MEMO_LIMIT = 10_000;
const memo = new Map<string, VerifiedCode>();

/** Verdict for one hit from the in-memory cache only: never fetches, never blocks. */
export function verifyIp(agentId: string, rawIp: string): VerifiedCode {
  const ranges = listFor(agentId);
  if (!ranges || !rawIp) return UNVERIFIED;
  const key = `${agentUrls().get(agentId)}\u0001${rawIp}`;
  let code = memo.get(key);
  if (code === undefined) {
    const addr = normalizeIp(rawIp);
    code = !addr || INTERNAL.check(addr.ip, addr.family) ? UNVERIFIED : ranges.list.check(addr.ip, addr.family) ? VERIFIED : SPOOFED;
    if (memo.size >= MEMO_LIMIT) memo.clear();
    memo.set(key, code);
  }
  return code;
}

/** The loaded prefixes for an agent's published list (null when it has none or it isn't loaded). Used by the demo seed. */
export function loadedPrefixes(agentId: string): string[] | null {
  return listFor(agentId)?.prefixes ?? null;
}

/** Readable fetch failure; connection attempts to several addresses fail as an AggregateError with no message. */
function describe(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length) return describe(err.errors[0]);
  if (err instanceof Error) return err.message || (err as NodeJS.ErrnoException).code || err.name;
  return String(err);
}

async function fetchList(url: string): Promise<boolean> {
  try {
    const res = await safeFetch(url, { timeoutMs: 15_000, maxBytes: MAX_LIST_BYTES, headers: { accept: 'application/json', 'user-agent': USER_AGENT } });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (res.truncated) throw new Error(`list larger than ${MAX_LIST_BYTES / 1024 / 1024} MB`);
    const prefixes = parseRanges(new TextDecoder().decode(res.body));
    if (!prefixes.length) throw new Error('no IP prefixes in the response');
    const entry = { fetchedAt: nowIso(), prefixes };
    setSetting(SETTING_PREFIX + url, JSON.stringify(entry));
    lists.set(url, { ...entry, list: buildList(prefixes) });
    memo.clear();
    failures.delete(url);
    return true;
  } catch (err) {
    const count = (failures.get(url)?.count ?? 0) + 1;
    failures.set(url, { count, retryAt: Date.now() + Math.min(REFRESH_MS, TICK_MS * 2 ** (count - 1)) });
    console.warn(`[ip-ranges] ${url}: ${describe(err)}${lists.has(url) ? ' (keeping the cached list)' : ''}`);
    return false;
  }
}

/** Fetches every list that is missing or older than 24 h (respecting failure back-off). Resolves to the number loaded. */
export async function refreshRanges(opts: { force?: boolean } = {}): Promise<number> {
  ensureLoaded();
  const now = Date.now();
  const due = rangeUrls().filter((url) => {
    if (opts.force) return true;
    const cached = lists.get(url);
    if (cached && now - Date.parse(cached.fetchedAt) < REFRESH_MS) return false;
    return (failures.get(url)?.retryAt ?? 0) <= now;
  });
  const results = await Promise.all(due.map(fetchList));
  return results.filter(Boolean).length;
}

/**
 * Re-checks unverified hits of the last 7 days whose agent's list is loaded (hits that arrived before it was).
 * Works in chunks and yields between them so ingestion keeps flowing. Resolves to the number of rows changed.
 */
export async function backfillUnverified(): Promise<number> {
  ensureLoaded();
  const agentIds = [...agentUrls()].filter(([, url]) => lists.has(url)).map(([agentId]) => agentId);
  if (!agentIds.length) return 0;
  const from = daysAgo(BACKFILL_DAYS - 1);
  const update = db.prepare('UPDATE bot_events SET verified = ? WHERE rowid = ? AND verified = 0');
  let after = 0;
  let changed = 0;
  for (;;) {
    const rows = all<{ rid: number; agent_id: string; ip: string }>(
      `SELECT rowid rid, agent_id, ip FROM bot_events WHERE rowid > ? AND verified = 0 AND day >= ? AND ip <> ''
       AND agent_id IN (${agentIds.map(() => '?').join(',')}) ORDER BY rowid LIMIT ${BACKFILL_CHUNK}`,
      [after, from, ...agentIds],
    );
    if (!rows.length) break;
    after = rows[rows.length - 1]!.rid;
    const write = () => {
      for (const r of rows) {
        const code = verifyIp(r.agent_id, r.ip);
        if (code !== UNVERIFIED) changed += Number(update.run(code, r.rid).changes);
      }
    };
    if (db.isTransaction) write();
    else tx(write);
    if (rows.length < BACKFILL_CHUNK) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return changed;
}

let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | null = null;

function tick(boot: boolean): Promise<void> {
  running ??= (async () => {
    try {
      // Cached lists can verify what arrived while the server was down or before they were first fetched.
      const fromCache = boot && lists.size ? await backfillUnverified() : 0;
      const fetched = await refreshRanges();
      const rechecked = fetched ? await backfillUnverified() : 0;
      if (boot || fetched) {
        const prefixes = [...lists.values()].reduce((n, l) => n + l.prefixes.length, 0);
        console.log(`[ip-ranges] ${lists.size}/${rangeUrls().length} lists loaded (${prefixes} prefixes, ${fetched} fetched now); ${fromCache + rechecked} recent hits re-checked`);
      }
    } catch (err) {
      console.error('[ip-ranges] refresh failed', err);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Starts background verification: cached lists load now, missing or stale ones are fetched, then an hourly check. */
export function startIpVerification(): void {
  if (timer) return;
  ensureLoaded();
  void tick(true);
  timer = setInterval(() => void tick(false), TICK_MS);
  timer.unref();
}
