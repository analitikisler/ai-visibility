// Shared chart chrome (BRAND §7): recessive axes/grid, token tooltips, legends that match entity colors.
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { dayLabel, num, pct, score } from '@/lib/format';

export interface SeriesDef {
  /** Data key in each row (e.g. 'brand' or a competitor id). */
  key: string;
  name: string;
  /** CSS color (token var). Resolve with `entityColorMap` / `engineColor`. */
  color: string;
  /** Brand series: thicker line (2.5px) and listed first. */
  emphasis?: boolean;
}

export type ValueFormat = 'percent' | 'number' | 'compact' | 'score' | ((v: number) => string);

export function formatValue(v: number | null | undefined, f: ValueFormat = 'number'): string {
  if (v == null) return '—';
  if (typeof f === 'function') return f(v);
  if (f === 'percent') return pct(v);
  if (f === 'score') return score(v);
  return num(v, { compact: f === 'compact' });
}

/** Axis tick formatter: percent ticks have no decimals; compact numbers. */
export function formatTick(v: number, f: ValueFormat = 'number'): string {
  if (typeof f === 'function') return f(v);
  if (f === 'percent') return `${Math.round(v * 100)}%`;
  if (f === 'score') return String(Math.round(v));
  return num(v, { compact: true });
}

export const axisTick = { fill: 'var(--color-text-subtle)', fontSize: 12, fontFamily: 'var(--font-sans)' } as const;
export const axisLine = { stroke: 'var(--color-border-strong)' } as const;
export const gridStroke = 'var(--color-border)';
export const cursorStroke = { stroke: 'var(--color-border-strong)', strokeWidth: 1 } as const;

/** Round a max up to a "nice" axis bound. Ratios cap at 1. */
export function niceMax(max: number, f: ValueFormat): number {
  if (!Number.isFinite(max) || max <= 0) return f === 'percent' ? 0.1 : 10;
  if (f === 'percent') {
    const step = max > 0.5 ? 0.2 : max > 0.2 ? 0.1 : 0.05;
    return Math.min(1, Math.ceil((max * 1.05) / step) * step);
  }
  const mag = 10 ** Math.floor(Math.log10(max));
  const n = max / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface TooltipRow {
  key: string;
  name: ReactNode;
  color: string;
  value: string;
  emphasis?: boolean;
}

/** Tooltip panel: surface bg, border, the overlay shadow, mono values (BRAND §7.5). */
export function ChartTooltipBox({ title, rows, footer }: { title?: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-40 max-w-72 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md">
      {title && <div className="mb-1.5 font-medium text-text-muted">{title}</div>}
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className="size-2 shrink-0 rounded-xs" style={{ background: r.color }} />
              <span className={cn('truncate', r.emphasis ? 'font-semibold text-text-strong' : 'text-text-muted')}>{r.name}</span>
            </span>
            <span className={cn('font-mono tnum', r.emphasis ? 'font-semibold text-text' : 'text-text')}>{r.value}</span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t border-border pt-1.5 text-text-subtle">{footer}</div>}
    </div>
  );
}

export const dayTick = (d: string) => dayLabel(d);

export interface LegendProps {
  items: SeriesDef[];
  /** Keys currently hidden (toggle mode). */
  hidden?: Set<string>;
  /** Makes items toggle buttons. */
  onToggle?: (key: string) => void;
  className?: string;
}

/** Legend with swatch dots; labels wear ink, not series color. Toggle mode uses aria-pressed buttons. */
export function ChartLegend({ items, hidden, onToggle, className }: LegendProps) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      {items.map((s) => {
        const off = hidden?.has(s.key);
        const inner = (
          <>
            <span
              aria-hidden
              className={cn('size-2 shrink-0 rounded-xs transition-opacity', off && 'opacity-30')}
              style={{ background: s.color }}
            />
            <span className={cn('truncate', s.emphasis ? 'font-semibold text-text' : 'text-text-muted', off && 'text-text-subtle line-through')}>
              {s.name}
            </span>
          </>
        );
        return (
          <li key={s.key} className="min-w-0">
            {onToggle ? (
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(s.key)}
                className="inline-flex max-w-48 items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs hover:bg-surface-2"
              >
                {inner}
              </button>
            ) : (
              <span className="inline-flex max-w-48 items-center gap-1.5 px-1 py-0.5 text-xs">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Placeholder shown inside a chart area when there is nothing to plot. */
export function ChartEmpty({ height, children }: { height: number; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed border-border text-[13px] text-text-subtle" style={{ height }}>
      {children ?? 'No data in this period'}
    </div>
  );
}
