// Neutral engine badges. Deliberately NOT vendor logos: each engine gets a
// plain geometric marker in its engine-series color (brand/retired/overt/BRAND.md §7.1). Distinct shapes mean
// the badge still reads without color (color-vision deficiency, mono print).
import type { EngineId } from '@shared/types';

/** Engine-series color tokens (brand/retired/overt/BRAND.md §7.1 "Engine series"). */
export const ENGINE_GLYPH_COLOR: Record<EngineId, string> = {
  chatgpt: 'var(--chart-4)', // Jade
  claude: 'var(--chart-2)', // Ember
  gemini: 'var(--chart-5)', // Iris
  perplexity: 'var(--chart-7)', // Lagoon
  grok: 'var(--chart-6)', // Ochre
  deepseek: 'var(--chart-3)', // Orchid
};

const ENGINE_LABEL: Record<EngineId, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
  deepseek: 'DeepSeek',
};

/** Marker shapes on a 24-unit grid, optically centred on (12, 12). */
function Shape({ engine, fill }: { engine: EngineId; fill: string }) {
  const round = { stroke: fill, strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  switch (engine) {
    case 'chatgpt': // disc
      return <circle cx="12" cy="12" r="5.25" fill={fill} />;
    case 'claude': // diamond
      return <path d="M12 6.25 17.75 12 12 17.75 6.25 12Z" fill={fill} {...round} />;
    case 'gemini': // twin discs
      return (
        <>
          <circle cx="8.1" cy="12" r="3.1" fill={fill} />
          <circle cx="15.9" cy="12" r="3.1" fill={fill} />
        </>
      );
    case 'perplexity': // triangle
      return <path d="M12 6 17.5 15.5H6.5Z" fill={fill} {...round} />;
    case 'grok': // square
      return <rect x="7.25" y="7.25" width="9.5" height="9.5" rx="1.25" fill={fill} />;
    case 'deepseek': // ring
      return <circle cx="12" cy="12" r="4.4" fill="none" stroke={fill} strokeWidth="2.5" />;
  }
}

export interface EngineGlyphProps {
  engine: EngineId;
  /** Square size in px (default 16). */
  size?: number;
  /**
   * `tile` (default): white marker on a rounded tile in the engine color.
   * `marker`: the colored marker alone (legends, dense tables).
   */
  variant?: 'tile' | 'marker';
  className?: string;
  /** Accessible name. Default: hidden from assistive tech, because the engine name should sit next to it. */
  title?: string;
}

/** Engine badge. Always show the engine name next to it (brand/retired/overt/BRAND.md §7.1). */
export function EngineGlyph({ engine, size = 16, variant = 'tile', className, title }: EngineGlyphProps) {
  const color = ENGINE_GLYPH_COLOR[engine];
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      focusable="false"
      data-engine={engine}
      style={{ flex: 'none' }}
      {...a11y}
    >
      {variant === 'tile' ? (
        <>
          <rect width="24" height="24" rx="6" fill={color} />
          <Shape engine={engine} fill="#fff" />
        </>
      ) : (
        <g transform="translate(12 12) scale(1.6) translate(-12 -12)">
          <Shape engine={engine} fill={color} />
        </g>
      )}
    </svg>
  );
}

/** Display name for an engine id (same strings as brand/retired/overt/BRAND.md "Engines"). */
export const engineGlyphLabel = (engine: EngineId) => ENGINE_LABEL[engine];
