import type { EngineId, EngineMode } from '@shared/types';
import { EngineGlyph } from '@/components/art';
import { cn } from '@/lib/cn';
import { ENGINES, isEngineId } from '@/lib/engines';
import { ModeBadge } from './ModeBadge';

/**
 * Engine identity glyph (Art's neutral geometric marker in the engine-series color, never a vendor logo).
 * `tile` = white marker on a colored tile; `marker` = colored marker only (legends, dense tables).
 */
export function EngineMark({ engine, size = 16, variant = 'tile', className }: { engine: EngineId | string; size?: number; variant?: 'tile' | 'marker'; className?: string }) {
  if (!isEngineId(engine)) return <span aria-hidden className={cn('inline-block shrink-0 rounded-sm bg-chart-other', className)} style={{ width: size, height: size }} />;
  return <EngineGlyph engine={engine} size={size} variant={variant} className={cn('shrink-0', className)} />;
}

export interface EngineBadgeProps {
  engine: EngineId | string;
  /** Show the mode badge after the name. */
  mode?: EngineMode;
  /** Show the vendor in muted text ("ChatGPT OpenAI"). */
  showVendor?: boolean;
  /** Glyph only (still labelled for screen readers). */
  iconOnly?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Engine glyph + official product name (+ optional mode badge). */
export function EngineBadge({ engine, mode, showVendor, iconOnly, size = 'md', className }: EngineBadgeProps) {
  const meta = isEngineId(engine) ? ENGINES[engine] : null;
  const name = meta?.name ?? engine;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', size === 'sm' ? 'text-xs' : 'text-[13px]', className)} title={iconOnly ? name : undefined}>
      <EngineMark engine={engine} size={size === 'sm' ? 14 : 16} />
      {iconOnly ? <span className="sr-only">{name}</span> : <span className="truncate font-medium text-text">{name}</span>}
      {showVendor && meta && !iconOnly && <span className="truncate text-text-subtle">{meta.vendor}</span>}
      {mode && <ModeBadge mode={mode} engineName={name} />}
    </span>
  );
}
