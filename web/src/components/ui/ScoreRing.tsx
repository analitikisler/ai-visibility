import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ScoreRingProps {
  /** 0..100; null renders an empty ring with "—". */
  value: number | null | undefined;
  size?: number;
  /** Ring thickness in px (defaults to ~9% of size). */
  thickness?: number;
  /**
   * `primary` (default): the brand blue (chart-1) — for the brand's own score.
   * `status`: success ≥ 70, warning ≥ 40, danger below — for audits/readiness.
   */
  tone?: 'primary' | 'status';
  /** Small text under the number ("/100", "Score"). */
  caption?: ReactNode;
  label?: string;
  className?: string;
}

function statusColor(v: number) {
  return v >= 70 ? 'var(--color-success)' : v >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';
}

/** 0..100 gauge with a mono value in the middle. */
export function ScoreRing({ value, size = 96, thickness, tone = 'primary', caption = '/100', label = 'Score', className }: ScoreRingProps) {
  const t = thickness ?? Math.max(4, Math.round(size * 0.09));
  const r = (size - t) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
  const color = v == null ? 'transparent' : tone === 'status' ? statusColor(v) : 'var(--color-chart-1)';
  const fontSize = Math.round(size * 0.3);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v ?? undefined}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-well)" strokeWidth={t} />
        {v != null && v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={t}
            strokeLinecap="butt"
            strokeDasharray={`${(v / 100) * c} ${c}`}
            className="transition-[stroke-dasharray] duration-220 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn('text-text-strong tnum', size >= 64 ? 'font-display font-heading tracking-[-0.012em]' : 'font-mono font-medium')} style={{ fontSize }}>
          {v == null ? '—' : Math.round(v)}
        </span>
        {caption && size >= 64 && <span className="mt-1 text-2xs text-text-subtle">{caption}</span>}
      </div>
    </div>
  );
}
