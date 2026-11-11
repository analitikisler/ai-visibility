// Notifications: one workspace webhook that receives a JSON POST when something needs attention (a visibility drop,
// a failed check, a new AI agent, the monthly budget reached). Delivery never blocks or fails the work that caused it.
import { daysAgo, get, getSetting, nowIso, parseJson, setSetting } from '../db/index.ts';
import { BlockedUrlError, checkUrl, safeFetch } from '../lib/safe-fetch.ts';
import type { NotificationDelivery, NotificationKind, NotificationSettings } from '../../../shared/types.ts';
import { marginPoints } from './stats.ts';

export const NOTIFICATION_KINDS = ['visibility_drop', 'check_failed', 'new_agent', 'budget_reached'] as const satisfies readonly NotificationKind[];
const KEYS = { url: 'NOTIFY_WEBHOOK_URL', events: 'NOTIFY_EVENTS', last: 'NOTIFY_LAST_DELIVERY' } as const;
const TIMEOUT_MS = 10_000;
/** A drop is reported when visibility over the last 7 days is at least this many points below the 7 days before. */
const DROP_POINTS = 5;
const DROP_WINDOW_DAYS = 7;
/** Fewer answers than this in either week is too little to call a drop. */
const DROP_MIN_ANSWERS = 10;

export interface ProjectRef { id: string; name: string; domain: string }

export interface NotificationPayload {
  event: NotificationKind | 'test';
  title: string;
  /** One or two plain sentences, ready to show as a message. */
  text: string;
  project: ProjectRef | null;
  at: string;
  data: Record<string, unknown>;
}

const webhookUrl = (): string | undefined => getSetting(KEYS.url) || process.env[KEYS.url]?.trim() || undefined;

function enabledKinds(): NotificationKind[] {
  const stored = parseJson<string[] | null>(getSetting(KEYS.events), null);
  return stored ? NOTIFICATION_KINDS.filter((k) => stored.includes(k)) : [...NOTIFICATION_KINDS];
}

/** "https://hooks.example.com/…a1b2": webhook URLs usually carry a secret in the path. */
function mask(url: string): string {
  try {
    const u = new URL(url);
    const tail = (u.pathname + u.search).replace(/\/+$/, '');
    return tail.length > 1 ? `${u.origin}/…${tail.slice(-4)}` : u.origin;
  } catch {
    return '…';
  }
}

export function notificationSettings(): NotificationSettings {
  const url = webhookUrl();
  return { webhookUrl: url ? mask(url) : null, events: enabledKinds(), lastDelivery: parseJson<NotificationDelivery | null>(getSetting(KEYS.last), null) };
}

/** Saves the webhook URL (public http(s) only; null or '' clears it) and which events are sent. */
export function updateNotificationSettings(patch: { webhookUrl?: string | null; events?: NotificationKind[] }): NotificationSettings {
  if (patch.webhookUrl !== undefined) {
    const url = patch.webhookUrl?.trim() ?? '';
    if (url) {
      try {
        checkUrl(url);
      } catch (err) {
        throw Object.assign(new Error(`Can't use this webhook URL: ${err instanceof BlockedUrlError ? err.message : 'invalid URL'}`), { status: 400 });
      }
    }
    setSetting(KEYS.url, url || null);
    if (!url) setSetting(KEYS.last, null);
  }
  if (patch.events !== undefined) setSetting(KEYS.events, JSON.stringify(NOTIFICATION_KINDS.filter((k) => patch.events!.includes(k))));
  return notificationSettings();
}

/** How a payload leaves the server. Tests replace `post`; private and internal addresses are refused (lib/safe-fetch.ts). */
export const transport = {
  async post(url: string, body: string): Promise<number> {
    const res = await safeFetch(url, {
      method: 'POST', body, timeoutMs: TIMEOUT_MS, maxBytes: 64 * 1024,
      headers: { 'content-type': 'application/json', 'user-agent': 'ai-visibility/0.1 (+https://analitikisler.com; notifications)' },
    });
    return res.status;
  },
};

/** Posts one payload to the webhook and records how it went. Never throws. */
export async function deliver(payload: NotificationPayload): Promise<NotificationDelivery> {
  const url = webhookUrl();
  let delivery: NotificationDelivery;
  if (!url) delivery = { at: nowIso(), ok: false, status: null, error: 'No webhook URL is set', event: payload.event };
  else {
    try {
      const status = await transport.post(url, JSON.stringify(payload));
      delivery = { at: nowIso(), ok: status >= 200 && status < 300, status, error: status >= 200 && status < 300 ? null : `The webhook answered HTTP ${status}`, event: payload.event };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : '';
      const reason = name === 'TimeoutError' || name === 'AbortError' ? `no answer within ${TIMEOUT_MS / 1000}s`
        : /ENOTFOUND|EAI_AGAIN/.test(raw) ? "the webhook's host name doesn't resolve"
        : /ECONNREFUSED/.test(raw) ? 'the webhook refused the connection'
        : raw;
      delivery = { at: nowIso(), ok: false, status: null, error: reason.slice(0, 200), event: payload.event };
    }
  }
  if (url) setSetting(KEYS.last, JSON.stringify(delivery));
  if (!delivery.ok && url) console.warn(`[notify] ${payload.event} not delivered: ${delivery.error}`);
  return delivery;
}

export const sendTestNotification = () =>
  deliver({ event: 'test', title: 'Test notification', text: 'ai visibility can reach this webhook.', project: null, at: nowIso(), data: {} });

interface NotifyInput {
  project?: ProjectRef | null;
  title: string;
  text: string;
  data?: Record<string, unknown>;
  /** Send at most once per `value` for this key (e.g. once a month, once per agent). */
  once?: { key: string; value: string };
  /** Send at most once per this many days for this key. */
  cooldown?: { key: string; days: number };
}

/**
 * Queues a notification if a webhook is set and this kind is switched on. Returns at once; delivery happens in the
 * background. The once/cooldown mark is written before sending, so a slow or failing webhook is never retried in a loop.
 */
export function notify(kind: NotificationKind, input: NotifyInput): void {
  if (!webhookUrl() || !enabledKinds().includes(kind)) return;
  if (input.once) {
    const key = `notified:${input.once.key}`;
    if (getSetting(key) === input.once.value) return;
    setSetting(key, input.once.value);
  }
  if (input.cooldown) {
    const key = `notified:${input.cooldown.key}`;
    const last = getSetting(key);
    if (last && last > daysAgo(input.cooldown.days)) return;
    setSetting(key, daysAgo(0));
  }
  void deliver({ event: kind, title: input.title, text: input.text, project: input.project ?? null, at: nowIso(), data: input.data ?? {} });
}

// ---------------------------------------------------------------- after a check

interface RunRow { project_id: string; status: string; error: string | null; total_jobs: number; failed_jobs: number; trigger: string }

/** Called when a check reaches its final state: reports a failed check, or a real drop in visibility. Demo projects never notify. */
export function notifyAfterRun(runId: string): void {
  const r = get<RunRow>('SELECT project_id, status, error, total_jobs, failed_jobs, trigger FROM runs WHERE id = ?', [runId]);
  const p = r && get<ProjectRef & { is_demo: number }>('SELECT id, name, domain, is_demo FROM projects WHERE id = ?', [r.project_id]);
  if (!r || !p || p.is_demo) return;
  const project: ProjectRef = { id: p.id, name: p.name, domain: p.domain };
  if (r.status === 'failed') {
    notify('check_failed', {
      project, title: `Check failed for ${p.name}`, text: r.error ?? 'No engine returned an answer.',
      data: { runId, trigger: r.trigger, failedJobs: r.failed_jobs, totalJobs: r.total_jobs },
    });
    return;
  }
  const window = (from: string, to: string) =>
    get<{ n: number; b: number | null }>(
      'SELECT COUNT(*) n, SUM(brand_mentioned) b FROM responses WHERE project_id = ? AND error IS NULL AND day >= ? AND day < ?', [p.id, from, to]) ?? { n: 0, b: 0 };
  const cur = window(daysAgo(DROP_WINDOW_DAYS - 1), '9999');
  const prev = window(daysAgo(2 * DROP_WINDOW_DAYS - 1), daysAgo(DROP_WINDOW_DAYS - 1));
  if (cur.n < DROP_MIN_ANSWERS || prev.n < DROP_MIN_ANSWERS) return;
  const now = ((cur.b ?? 0) / cur.n) * 100;
  const before = ((prev.b ?? 0) / prev.n) * 100;
  const margin = Math.hypot(marginPoints(cur.b ?? 0, cur.n) ?? 0, marginPoints(prev.b ?? 0, prev.n) ?? 0);
  // A drop that is large, outside the margin of error and based on enough answers, at most once a week per project.
  if (before - now < DROP_POINTS || before - now < margin) return;
  notify('visibility_drop', {
    project, title: `${p.name}: visibility down ${Math.round(before - now)} points`,
    text: `Visibility over the last ${DROP_WINDOW_DAYS} days is ${Math.round(now)}, down from ${Math.round(before)} in the ${DROP_WINDOW_DAYS} days before.`,
    data: { visibility: Math.round(now * 10) / 10, previous: Math.round(before * 10) / 10, answers: cur.n, previousAnswers: prev.n, days: DROP_WINDOW_DAYS },
    cooldown: { key: `${p.id}:visibility_drop`, days: DROP_WINDOW_DAYS },
  });
}
