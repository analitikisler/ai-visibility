// Classifies raw hits (bot vs AI referral vs other) and writes them to bot_events / referral_events.
import { createHash } from 'node:crypto';
import { all, db, get, id, tx } from '../db/index.ts';
import { notify } from '../services/notify.ts';
import { classifyAgent, classifyReferrer } from './catalog.ts';
import { SPOOFED, verifyIp } from './verify.ts';

export type EventSource = 'ingest' | 'log_upload' | 'pixel' | 'demo';

/** One normalized hit, regardless of where it came from. */
export interface Hit {
  ts: string;          // ISO
  path: string;        // pathname only
  url?: string;        // full URL or path+query (used for utm_source detection)
  userAgent: string;
  ip: string;
  referrer: string;
  status: number | null;
  sessionId?: string;
  signatureAgent?: string; // Signature-Agent header (Web Bot Auth), identifies agents that use a browser UA
}

export interface RecordResult {
  bots: number;
  referrals: number;
  ignored: number;
  duplicates: number;
  /** Dropped because the project reached its daily cap for that kind of event. */
  capped: number;
}

const MAX_PATH = 512;
const MAX_UA = 512;
const MAX_REFERRER = 2048;
/** Hits stamped further ahead than this are rejected (clock skew below it is clamped to now). */
const MAX_FUTURE_MS = 24 * 3600_000;

/** Extracts a clean pathname from a full URL or a path (query and hash removed). */
export function normalizePath(raw: string | undefined): string {
  if (!raw) return '/';
  let path = raw.trim();
  try {
    path = new URL(path, 'http://x.invalid').pathname;
  } catch {
    path = path.split(/[?#]/)[0] ?? '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return path.slice(0, MAX_PATH);
}

/**
 * Parses a timestamp-ish value into ISO for storage: missing/invalid → now, slightly in the future → now.
 * Returns null (caller skips the hit) when it is more than a day ahead or older than `maxAgeDays`.
 */
export function normalizeTs(raw: string | undefined, maxAgeDays: number): string | null {
  const now = Date.now();
  if (!raw) return new Date(now).toISOString();
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return new Date(now).toISOString();
  if (t > now + MAX_FUTURE_MS || t < now - maxAgeDays * 86_400_000) return null;
  return new Date(Math.min(t, now)).toISOString();
}

/** Deterministic id so re-uploading overlapping log files does not double count. */
function stableId(prefix: string, parts: (string | number | null)[]): string {
  return `${prefix}_${createHash('sha1').update(parts.join('\u0001')).digest('hex').slice(0, 20)}`;
}

/**
 * Per project and UTC day, at most this many AI-crawler events and referral visits are stored, so a flood from someone
 * holding a site key can't grow the database without bound. Far above any real site's AI traffic.
 */
export const DAILY_CAPS = { bot: 200_000, referral: 50_000 } as const;
const dayCounts = new Map<string, number>();

/** Stored events of `kind` for project/day; counted once from the database, then tracked in memory. */
function storedToday(kind: keyof typeof DAILY_CAPS, projectId: string, day: string): number {
  const key = `${kind}|${projectId}|${day}`;
  let n = dayCounts.get(key);
  if (n === undefined) {
    const table = kind === 'bot' ? 'bot_events' : 'referral_events';
    n = get<{ n: number }>(`SELECT COUNT(*) n FROM ${table} WHERE project_id = ? AND day = ?`, [projectId, day])?.n ?? 0;
    if (dayCounts.size > 10_000) dayCounts.clear();
    dayCounts.set(key, n);
  }
  return n;
}
const countStored = (kind: keyof typeof DAILY_CAPS, projectId: string, day: string) =>
  dayCounts.set(`${kind}|${projectId}|${day}`, storedToday(kind, projectId, day) + 1);

/** A project's first two days of events are its baseline: agents seen then aren't "new". */
const NEW_AGENT_GRACE_MS = 48 * 3600_000;
const seenAgents = new Map<string, { ids: Set<string>; trackingSince: number }>();

/** Agents this project has seen so far and when its tracking started; read once from the database, then kept in memory. */
function agentsSeen(projectId: string): { ids: Set<string>; trackingSince: number } {
  let seen = seenAgents.get(projectId);
  if (!seen) {
    const rows = all<{ agent_id: string; first: string }>(
      `SELECT agent_id, MIN(ts) first FROM bot_events WHERE project_id = ? AND verified <> ${SPOOFED} GROUP BY agent_id`, [projectId]);
    const firsts = rows.map((r) => Date.parse(r.first)).filter((t) => !Number.isNaN(t));
    seen = { ids: new Set(rows.map((r) => r.agent_id)), trackingSince: firsts.length ? Math.min(...firsts) : Date.now() };
    if (seenAgents.size > 10_000) seenAgents.clear();
    seenAgents.set(projectId, seen);
  }
  return seen;
}

/**
 * Classifies and stores hits in one transaction. Bot UAs win over referrers; hits that are neither a known agent nor
 * an AI referral are ignored. `dedupe` uses content-derived ids (for log uploads). Bot hits are IP-verified from the
 * in-memory range cache (verify.ts), so ingestion never waits on the network. `referralsOnly` (the public pixel
 * beacon) never records crawler events: anyone can read a site key from a page, so only token-authenticated sources
 * may report bots.
 */
export function recordHits(projectId: string, hits: Hit[], source: EventSource, opts: { dedupe?: boolean; referralsOnly?: boolean } = {}): RecordResult {
  const out: RecordResult = { bots: 0, referrals: 0, ignored: 0, duplicates: 0, capped: 0 };
  if (!hits.length) return out;
  const seen = opts.referralsOnly ? null : agentsSeen(projectId);
  const fresh: { name: string; operator: string; category: string; path: string }[] = [];
  const verb = opts.dedupe ? 'INSERT OR IGNORE' : 'INSERT';
  const botStmt = db.prepare(
    `${verb} INTO bot_events (id, project_id, ts, day, agent_id, agent_name, operator, category, path, status, user_agent, ip, verified, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const refStmt = db.prepare(
    `${verb} INTO referral_events (id, project_id, ts, day, source_id, source_name, landing_path, referrer, session_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const write = () => {
    for (const h of hits) {
      const day = h.ts.slice(0, 10);
      const agent = opts.referralsOnly ? null : classifyAgent(h.userAgent, h.signatureAgent);
      if (agent) {
        if (storedToday('bot', projectId, day) >= DAILY_CAPS.bot) {
          out.capped++;
          continue;
        }
        const rid = opts.dedupe ? stableId('bot', [projectId, h.ts, h.ip, h.path, h.status, h.userAgent]) : id('bot');
        const verified = verifyIp(agent.id, h.ip);
        const r = botStmt.run(rid, projectId, h.ts, day, agent.id, agent.name, agent.operator, agent.category, h.path, h.status,
          h.userAgent.slice(0, MAX_UA), h.ip.slice(0, 64), verified, source);
        if (Number(r.changes) > 0) {
          out.bots++;
          countStored('bot', projectId, day);
          // First sighting of an agent (not a spoofed one), on a project past its baseline, in a recent hit.
          const t = Date.parse(h.ts);
          if (seen && verified !== SPOOFED) seen.trackingSince = Math.min(seen.trackingSince, t);
          if (seen && verified !== SPOOFED && !seen.ids.has(agent.id)) {
            seen.ids.add(agent.id);
            if (t - seen.trackingSince >= NEW_AGENT_GRACE_MS && Date.now() - t <= NEW_AGENT_GRACE_MS) {
              fresh.push({ name: agent.name, operator: agent.operator, category: agent.category, path: h.path });
            }
          }
        } else out.duplicates++;
        continue;
      }
      const ref = classifyReferrer(h.referrer, h.url ?? h.path);
      if (ref) {
        if (storedToday('referral', projectId, day) >= DAILY_CAPS.referral) {
          out.capped++;
          continue;
        }
        const rid = opts.dedupe ? stableId('ref', [projectId, h.ts, h.ip, h.path, h.referrer]) : id('ref');
        const r = refStmt.run(rid, projectId, h.ts, day, ref.id, ref.name, h.path, h.referrer.slice(0, MAX_REFERRER), (h.sessionId ?? '').slice(0, 64), source);
        if (Number(r.changes) > 0) {
          out.referrals++;
          countStored('referral', projectId, day);
        } else out.duplicates++;
        continue;
      }
      out.ignored++;
    }
  };
  if (db.isTransaction) write();
  else tx(write);
  if (fresh.length) {
    const project = get<{ id: string; name: string; domain: string }>('SELECT id, name, domain FROM projects WHERE id = ? AND is_demo = 0', [projectId]);
    for (const a of project ? fresh : []) {
      notify('new_agent', {
        project, title: `New AI agent on ${project!.domain}: ${a.name}`,
        text: `${a.name} (${a.operator}) fetched ${a.path} for the first time.`,
        data: { agent: a.name, operator: a.operator, category: a.category, path: a.path },
        once: { key: `${projectId}:new_agent:${a.name}`, value: 'sent' },
      });
    }
  }
  return out;
}
