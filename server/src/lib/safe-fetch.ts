// Outbound GET for user-supplied URLs (audits, sitemaps, homepage lookups) with SSRF protection:
// - http(s) only; single-label, localhost, *.local, *.internal … hostnames are refused;
// - every address a hostname resolves to must be public unicast — checked inside the socket's DNS lookup, so the
//   address that is validated is the one connected to (no DNS-rebinding window); IP literals are checked up front;
// - redirects are followed manually (≤ 5 hops) and each hop goes through the same checks;
// - one deadline covers all hops and the body; the body is capped after decompression (bomb-safe).
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/** Thrown (or returned as the failure cause) when a URL points at a non-public destination. */
export class BlockedUrlError extends Error {
  readonly code = 'EBLOCKED';
}

const BLOCKED = new BlockList();
const V4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const V6: [string, number][] = [
  // IPv4-mapped (::ffff:a.b.c.d) addresses need no entry: BlockList checks them against the IPv4 rules.
  ['::', 96], // unspecified, loopback, IPv4-compatible
  ['64:ff9b::', 96], ['64:ff9b:1::', 48], // NAT64 (could embed a private IPv4)
  ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], // discard, Teredo, documentation, 6to4
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], // unique-local, link-local, site-local, multicast
];
for (const [net, prefix] of V4) BLOCKED.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of V6) BLOCKED.addSubnet(net, prefix, 'ipv6');

/** True for loopback, private, link-local (incl. cloud metadata), CGNAT, unique-local, multicast and reserved IPs. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (!v) return true;
  try {
    return BLOCKED.check(ip, v === 4 ? 'ipv4' : 'ipv6');
  } catch {
    return true;
  }
}

const BLOCKED_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'home.arpa', 'lan'];

/**
 * Synchronous checks on a URL (scheme, hostname shape, IP literals). Throws BlockedUrlError with a user-facing reason.
 * DNS-based checks happen at connect time; use assertPublicUrl() to also resolve up front.
 */
export function checkUrl(raw: string | URL): URL {
  let u: URL;
  try {
    u = typeof raw === 'string' ? new URL(raw) : raw;
  } catch {
    throw new BlockedUrlError('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BlockedUrlError(`Only http(s) URLs can be fetched (got ${u.protocol})`);
  if (u.username || u.password) throw new BlockedUrlError('URLs with credentials are not fetched');
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError(`${host} is a private or reserved address — only public websites can be fetched`);
    return u;
  }
  if (!host.includes('.') || BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    throw new BlockedUrlError(`${host} is not a public hostname — only public websites can be fetched`);
  }
  return u;
}

/** checkUrl() plus a DNS resolution: rejects when any resolved address is private. DNS failures are not rejected here. */
export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  const u = checkUrl(raw);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return u;
  const addrs = await new Promise<LookupAddress[]>((resolve) =>
    dnsLookup(host, { all: true }, (err, list) => resolve(err ? [] : list)),
  );
  const bad = addrs.find((a) => isPrivateIp(a.address));
  if (bad) throw new BlockedUrlError(`${host} resolves to a private address (${bad.address}) — only public websites can be fetched`);
  return u;
}

/** Socket lookup that refuses private addresses, so the validated address is the one connected to. */
const safeLookup = ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
  dnsLookup(hostname, { ...options, all: true }, (err, list: LookupAddress[]) => {
    if (err) return callback(err);
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad || !list.length) {
      return callback(new BlockedUrlError(`${hostname} resolves to a private address${bad ? ` (${bad.address})` : ''} — only public websites can be fetched`));
    }
    if (options.all) callback(null, list);
    else callback(null, list[0]!.address, list[0]!.family);
  });
}) as unknown as LookupFunction;

export interface SafeResponse {
  status: number;
  url: string;          // final URL after redirects
  headers: Headers;
  body: Uint8Array;     // decompressed, capped at maxBytes
  bytes: number;
  truncated: boolean;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    try {
      for (const x of Array.isArray(v) ? v : [v]) h.append(k, x);
    } catch {
      // Skip header values the Headers class refuses.
    }
  }
  return h;
}

function request(u: URL, headers: Record<string, string>, signal: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method: 'GET', headers, lookup: safeLookup, signal, agent: false }, resolve);
    req.on('error', reject);
    req.end();
  });
}

async function readCapped(res: http.IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<{ body: Uint8Array; truncated: boolean }> {
  const enc = String(res.headers['content-encoding'] ?? '').trim().toLowerCase();
  const decoder = enc === 'gzip' || enc === 'x-gzip' ? createGunzip() : enc === 'deflate' ? createInflate() : enc === 'br' ? createBrotliDecompress() : null;
  const stream: Readable = decoder ? res.pipe(decoder) : res;
  if (decoder) res.on('error', (e) => decoder.destroy(e));
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  const onAbort = () => stream.destroy(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      if (bytes + chunk.byteLength > maxBytes) {
        chunks.push(chunk.subarray(0, maxBytes - bytes));
        bytes = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(chunk);
      bytes += chunk.byteLength;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    res.destroy();
    decoder?.destroy();
  }
  return { body: new Uint8Array(Buffer.concat(chunks, bytes)), truncated };
}

/** GET with SSRF checks on every hop. Rejects with BlockedUrlError, network errors, or an AbortError on timeout. */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 5;
  const headers = { 'accept-encoding': 'gzip, deflate, br', ...opts.headers };
  let current = checkUrl(url);
  for (let hop = 0; ; hop++) {
    const res = await request(current, headers, signal);
    const location = res.headers.location;
    if (REDIRECTS.has(res.statusCode ?? 0) && location) {
      res.resume();
      res.destroy();
      if (hop >= maxRedirects) throw new Error(`Too many redirects (more than ${maxRedirects})`);
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new Error(`Invalid redirect location: ${location.slice(0, 200)}`);
      }
      current = checkUrl(next);
      continue;
    }
    const { body, truncated } = await readCapped(res, maxBytes, signal);
    return { status: res.statusCode ?? 0, url: current.toString(), headers: toHeaders(res.headers), body, bytes: body.byteLength, truncated };
  }
}
