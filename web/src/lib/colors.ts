// Stable entity colors on the Çini categorical series (web/src/cini/README.md): brand = cat-1, competitors cat-2…6 in
// project order, "other" (muted) beyond: more than 6 series are grouped as other. Color follows the entity, never the
// rank — always resolve through these helpers.
import type { AgentCategory, Competitor, Project, SentimentLabel, SourceType } from '@shared/types';

export const BRAND_COLOR = 'var(--color-data-cat-1)';
export const OTHER_COLOR = 'var(--color-muted)';
const SLOTS = [2, 3, 4, 5, 6].map((n) => `var(--color-data-cat-${n})`);

/**
 * Default palette hexes the server stores → theme-aware token vars. They are slot keys, never drawn as they are: the
 * server keeps the kit's light values (server/src/services/projects.ts), and the tokens may since have been retuned.
 */
const PALETTE_HEX: Record<string, string> = {
  '#c45e3d': BRAND_COLOR,
  '#584687': SLOTS[0]!,
  '#778536': SLOTS[1]!,
  '#245289': SLOTS[2]!,
  '#5a9354': SLOTS[3]!,
  '#77396b': SLOTS[4]!,
  '#5b5551': OTHER_COLOR,
};

/** Slot color for the competitor at `index` in the project's competitor list. */
export function competitorSlotColor(index: number): string {
  return SLOTS[index] ?? OTHER_COLOR;
}

/**
 * Color for one competitor: a stored kit key is mapped to its token (so dark mode works); anything else (empty, or a
 * colour outside the kit) falls back to the order slot, so charts only ever draw the kit's series.
 */
export function competitorColor(c: Pick<Competitor, 'color'>, index: number): string {
  return PALETTE_HEX[c.color?.trim().toLowerCase() ?? ''] ?? competitorSlotColor(index);
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

/** Map a server-sent color (a kit key) onto a theme token; anything outside the kit gets the fallback. */
export function themeColor(value: string | null | undefined, fallback = OTHER_COLOR): string {
  return PALETTE_HEX[value?.trim().toLowerCase() ?? ''] ?? fallback;
}

export const SENTIMENT_COLORS: Record<SentimentLabel, string> = {
  positive: 'var(--color-ok)',
  neutral: 'var(--color-muted)',
  negative: 'var(--color-bad)',
};

/**
 * Source type colors. Own domain = the brand (cat-1); competitor = the first competitor's hue (cat-2);
 * third party = muted. Always pair with a label.
 */
export const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  own: BRAND_COLOR,
  competitor: 'var(--color-data-cat-2)',
  third_party: OTHER_COLOR,
};
export const SOURCE_TYPE_NAMES: Record<SourceType, string> = { own: 'Your site', competitor: 'Competitor', third_party: 'Third party' };

/** Crawler categories as a categorical series (non-brand slots, fixed order). */
export const AGENT_CATEGORY_COLORS: Record<AgentCategory, string> = {
  training: 'var(--color-data-cat-2)',
  search: 'var(--color-data-cat-4)',
  user_fetch: 'var(--color-data-cat-5)',
  agent: 'var(--color-data-cat-3)',
  search_engine: 'var(--color-data-cat-6)',
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

/**
 * Heat ramp on the kit's sequential series: step 0 (no data or zero) is surface-2, steps 1–7 take seq 1, 2, 3, 5, 6,
 * 7, 8, chosen so a label stays ≥ 4.5 : 1 with the ink HeatmapGrid picks for it, in light and dark.
 */
export const HEAT_STEPS = [
  'var(--color-surface-2)',
  'var(--color-data-seq-1)',
  'var(--color-data-seq-2)',
  'var(--color-data-seq-3)',
  'var(--color-data-seq-5)',
  'var(--color-data-seq-6)',
  'var(--color-data-seq-7)',
  'var(--color-data-seq-8)',
] as const;

export const heatColor = (step: number) => HEAT_STEPS[Math.max(0, Math.min(7, step))]!;
