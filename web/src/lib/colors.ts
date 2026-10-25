// Stable entity colors (brand/retired/overt/BRAND.md §7.1): brand = chart-1, competitors chart-2…8 in project order,
// chart-other beyond. Color follows the entity, never the rank — always resolve through these helpers.
import type { AgentCategory, Competitor, Project, SentimentLabel, SourceType } from '@shared/types';

export const BRAND_COLOR = 'var(--chart-1)';
export const OTHER_COLOR = 'var(--chart-other)';
const SLOTS = [2, 3, 4, 5, 6, 7, 8].map((n) => `var(--chart-${n})`);

/**
 * Default palette hexes the server stores → theme-aware token vars. They are slot keys: the server keeps the
 * original light values (server/src/services/projects.ts), and the tokens may since have been retuned.
 */
const PALETTE_HEX: Record<string, string> = {
  '#1161bb': BRAND_COLOR,
  '#e5560f': SLOTS[0]!,
  '#cf4fb9': SLOTS[1]!,
  '#009068': SLOTS[2]!,
  '#8658e1': SLOTS[3]!,
  '#9f7100': SLOTS[4]!,
  '#0794b0': SLOTS[5]!,
  '#818c01': SLOTS[6]!,
  '#646d7e': OTHER_COLOR,
};

/** Slot color for the competitor at `index` in the project's competitor list. */
export function competitorSlotColor(index: number): string {
  return SLOTS[index] ?? OTHER_COLOR;
}

/**
 * Color for one competitor: a stored palette value is mapped to its token (so dark mode works),
 * a custom stored value is respected as an override, and an empty value falls back to the order slot.
 */
export function competitorColor(c: Pick<Competitor, 'color'>, index: number): string {
  const stored = c.color?.trim().toLowerCase();
  if (stored) return PALETTE_HEX[stored] ?? c.color;
  return competitorSlotColor(index);
}

/** `entityKey → color` for 'brand' + every competitor id. Build once per project and pass down. */
export function entityColorMap(project: Pick<Project, 'competitors'> | null | undefined): Record<string, string> {
  const map: Record<string, string> = { brand: BRAND_COLOR, other: OTHER_COLOR };
  project?.competitors.forEach((c, i) => {
    map[c.id] = competitorColor(c, i);
  });
  return map;
}

/** Resolve a color for an entity key with a fallback for unknown keys. */
export function colorFor(map: Record<string, string>, key: string): string {
  return map[key] ?? OTHER_COLOR;
}

/** Map any server-sent color (hex from the default palette) onto a theme token. */
export function themeColor(value: string | null | undefined, fallback = OTHER_COLOR): string {
  if (!value) return fallback;
  return PALETTE_HEX[value.trim().toLowerCase()] ?? value;
}

export const SENTIMENT_COLORS: Record<SentimentLabel, string> = {
  positive: 'var(--color-sent-pos)',
  neutral: 'var(--color-sent-neu)',
  negative: 'var(--color-sent-neg)',
};

/**
 * Source type colors. Own domain = the brand (chart-1, brand blue); competitor = first competitor hue (Ember);
 * third party = slate. Always pair with a label.
 */
export const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  own: BRAND_COLOR,
  competitor: 'var(--chart-2)',
  third_party: OTHER_COLOR,
};
export const SOURCE_TYPE_NAMES: Record<SourceType, string> = { own: 'Your site', competitor: 'Competitor', third_party: 'Third party' };

/** Crawler categories as a categorical series (non-brand slots, fixed order). */
export const AGENT_CATEGORY_COLORS: Record<AgentCategory, string> = {
  training: 'var(--chart-2)',
  search: 'var(--chart-4)',
  user_fetch: 'var(--chart-5)',
  agent: 'var(--chart-7)',
  search_engine: 'var(--chart-6)',
  seo_tool: OTHER_COLOR,
};
export const AGENT_CATEGORY_NAMES: Record<AgentCategory, string> = {
  training: 'Training',
  search: 'AI search',
  user_fetch: 'User fetch',
  agent: 'Agent',
  search_engine: 'Search engine',
  seo_tool: 'SEO tool',
};

/** Heat ramp step (0..7) for a 0..1 value; null/0 → step 0. */
export function heatStep(value: number | null | undefined, steps = 7): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(steps, Math.max(1, Math.ceil(Math.min(1, value) * steps)));
}

export const heatColor = (step: number) => `var(--heat-${Math.max(0, Math.min(7, step))})`;
