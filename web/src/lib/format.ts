// Number, date and delta formatting per brand/retired/overt/BRAND.md §4 "Writing metrics".
// Every formatter returns '—' for null/undefined/NaN so callers never print "0" for missing data.
import type { SentimentLabel } from '@shared/types';

export const DASH = '—';
/** True minus sign (U+2212) for negative numbers. */
export const MINUS = '−';

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const signed = (n: number, body: string) => (n > 0 ? `+${body}` : n < 0 ? `${MINUS}${body}` : body);

const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
/** Exactly one decimal (`4.0`), so values in one column line up (`#2.0` next to `#1.7`, `5.0%` next to `4.7%`). */
const oneFixedFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Percent from a 0..1 ratio: no decimal at ≥10%, one decimal below (`38%`, `4.2%`, `5.0%`, `0%`).
 * Pass `{ from100: true }` when the value is already 0..100.
 */
export function pct(value: number | null | undefined, opts: { from100?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const p = opts.from100 ? value : value * 100;
  if (p === 0) return '0%';
  const abs = Math.abs(p);
  // Round first so 9.96 reads `10%`, not `10.0%`.
  const body = Math.round(abs * 10) / 10 >= 10 ? intFmt.format(abs) : abs < 0.1 ? '<0.1' : oneFixedFmt.format(abs);
  return `${p < 0 ? MINUS : ''}${body}%`;
}

/** Integer 0..100 score, no unit (`42`). */
export function score(value: number | null | undefined): string {
  return isNum(value) ? intFmt.format(Math.round(value)) : DASH;
}

/** Grouped integer (`12,480`); compact above 10k when `compact` (`12.5k`, `1.2M`). */
export function num(value: number | null | undefined, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (!isNum(value)) return DASH;
  const abs = Math.abs(value);
  if (opts.compact && abs >= 10_000) {
    const [div, unit] = abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : [1e3, 'k'];
    const v = abs / div;
    const body = (v >= 100 ? intFmt : oneFmt).format(v) + unit;
    return value < 0 ? `${MINUS}${body}` : body;
  }
  const f = opts.decimals != null ? new Intl.NumberFormat('en-US', { maximumFractionDigits: opts.decimals }) : intFmt;
  const body = f.format(abs);
  return value < 0 ? `${MINUS}${body}` : body;
}

/** Compact count for tiles (`12.5k`). */
export const compact = (value: number | null | undefined) => num(value, { compact: true });

/** Average rank (`#2.4`). 0/null means never mentioned → '—'. */
export function position(value: number | null | undefined): string {
  if (!isNum(value) || value <= 0) return DASH;
  return `#${oneFixedFmt.format(value)}`;
}

/** Ordinal for a single answer's position (`2nd`). */
export function ordinal(n: number | null | undefined): string {
  if (!isNum(n) || n <= 0) return DASH;
  const v = Math.round(n);
  const s = v % 100 >= 11 && v % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th');
  return `${v}${s}`;
}

/** Map raw sentiment −1..1 to the 0..100 KPI scale. */
export function sentimentScore(raw: number | null | undefined): number | null {
  return isNum(raw) ? Math.round((raw + 1) * 50) : null;
}

/** Label for a 0..100 sentiment score (≥60 positive, ≤40 negative). */
export function sentimentLabelFromScore(score100: number | null | undefined): SentimentLabel | null {
  if (!isNum(score100)) return null;
  return score100 >= 60 ? 'positive' : score100 <= 40 ? 'negative' : 'neutral';
}

/** Label for raw −1..1 sentiment (same thresholds as the score mapping). */
export function sentimentLabel(raw: number | null | undefined): SentimentLabel | null {
  return sentimentLabelFromScore(sentimentScore(raw));
}

export const SENTIMENT_NAMES: Record<SentimentLabel, string> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

/** `{ score: 72, label: 'positive', text: '72 · Positive' }` from raw −1..1. */
export function sentiment(raw: number | null | undefined): { score: number | null; label: SentimentLabel | null; text: string } {
  const s = sentimentScore(raw);
  const label = sentimentLabelFromScore(s);
  return { score: s, label, text: s == null || !label ? DASH : `${s} · ${SENTIMENT_NAMES[label]}` };
}

/** Rounded percentage points with a correct unit (`1 pt`, `6 pts`); sign is the caller's job. */
export function points(n: number): string {
  const v = Math.round(Math.abs(n));
  return `${intFmt.format(v)} ${v === 1 ? 'pt' : 'pts'}`;
}

// ---------- Deltas ----------

/**
 * How a delta should read:
 * - `score`: 0..100 score, integer (`+6`)
 * - `points`: share/percentage in 0..100 points (`+6 pts`)
 * - `ratioPoints`: share as 0..1, rendered as points (`+6 pts`)
 * - `count`: integer count (`+12`, compact above 10k)
 * - `position`: average rank; lower is better (`−0.4`)
 * - `percent`: relative change already in % (`+12%`)
 */
export type DeltaKind = 'score' | 'points' | 'ratioPoints' | 'count' | 'position' | 'percent';
export type Tone = 'good' | 'bad' | 'neutral';

export interface DeltaView {
  text: string;
  tone: Tone;
  direction: 'up' | 'down' | 'flat' | 'none';
}

/** Below this magnitude a delta renders as "no change". */
const EPS: Record<DeltaKind, number> = { score: 0.5, points: 0.5, ratioPoints: 0.005, count: 0.5, position: 0.05, percent: 0.5 };

export function formatDelta(delta: number | null | undefined, kind: DeltaKind, opts: { invert?: boolean } = {}): DeltaView {
  if (!isNum(delta)) return { text: DASH, tone: 'neutral', direction: 'none' };
  if (Math.abs(delta) < EPS[kind]) {
    return { text: kind === 'points' || kind === 'ratioPoints' ? '0 pts' : '0', tone: 'neutral', direction: 'flat' };
  }
  const lowerIsBetter = kind === 'position' ? !opts.invert : !!opts.invert;
  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  const abs = Math.abs(delta);
  let body: string;
  switch (kind) {
    case 'score': body = intFmt.format(Math.round(abs)); break;
    case 'points': body = points(abs); break;
    case 'ratioPoints': body = points(abs * 100); break;
    case 'count': body = num(abs, { compact: true }); break;
    case 'position': body = oneFmt.format(abs); break;
    case 'percent': body = `${intFmt.format(Math.round(abs))}%`; break;
  }
  return { text: signed(delta, body), tone: improving ? 'good' : 'bad', direction: delta > 0 ? 'up' : 'down' };
}

// ---------- Time ----------

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const LOCAL_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const LOCAL_DATE_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const LOCAL_TIME = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 'YYYY-MM-DD' → `Oct 14` (parsed as UTC so the label never shifts a day). */
export function dayLabel(day: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!day) return DASH;
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return (opts.year ? MONTH_DAY_YEAR : MONTH_DAY).format(d);
}

/** `Oct 14 – Oct 20` from two 'YYYY-MM-DD' days. */
export function dayRange(from: string, to: string): string {
  return `${dayLabel(from)} – ${dayLabel(to)}`;
}

/** ISO → `Oct 14` (adds the year when not the current year). */
export function date(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return (d.getFullYear() === new Date().getFullYear() ? LOCAL_DATE : LOCAL_DATE_YEAR).format(d);
}

/** ISO → `Oct 14, 14:32`. */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${date(iso)}, ${LOCAL_TIME.format(d)}`;
}

/** Relative for the last week (`just now`, `5m ago`, `2h ago`, `3d ago`), absolute after (`Oct 14`). */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return DASH;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return DASH;
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now'; // includes small clock skew into the future
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return date(iso);
}

/** `Last 30 days`. */
export function rangeLabel(days: number): string {
  return days === 1 ? 'Last 24 hours' : `Last ${days} days`;
}

/** Milliseconds → `840 ms` / `2.4 s`. */
export function duration(ms: number | null | undefined): string {
  if (!isNum(ms)) return DASH;
  return ms < 1000 ? `${intFmt.format(ms)} ms` : `${oneFmt.format(ms / 1000)} s`;
}

/** Bytes → `1.2 KB`. */
export function bytes(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  if (n < 1024) return `${intFmt.format(n)} B`;
  if (n < 1024 * 1024) return `${oneFmt.format(n / 1024)} KB`;
  return `${oneFmt.format(n / 1024 / 1024)} MB`;
}

// ---------- Money ----------

const usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdSmallFmt = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });

/**
 * Estimated spend in USD: `$12.40`, `$0.18`, `<$0.01`, `$0.00`.
 * `{ precise: true }` keeps two significant digits below 10¢ (`$0.0042`, `$0.012`) for per-answer costs.
 */
export function usd(value: number | null | undefined, opts: { precise?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  if (abs === 0) return '$0.00';
  if (opts.precise && abs < 0.1) return `${sign}$${usdSmallFmt.format(abs)}`;
  if (abs < 0.005) return `${sign}<$0.01`;
  return `${sign}$${usdFmt.format(abs)}`;
}

/** Simple English plural: `plural(3, 'prompt')` → `3 prompts`. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}
