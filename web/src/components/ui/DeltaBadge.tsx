import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDelta, type DeltaKind } from '@/lib/format';

export interface DeltaBadgeProps {
  delta: number | null | undefined;
  /** Unit/semantics. `position` treats lower as better. */
  kind: DeltaKind;
  /** Flip good/bad (e.g. negative-sentiment counts, error rates). */
  invert?: boolean;
  /** `soft` chip (default) or `plain` colored text. */
  variant?: 'soft' | 'plain';
  size?: 'sm' | 'md';
  className?: string;
}

const tones = {
  good: { soft: 'border border-success/40 bg-success-soft text-success', plain: 'text-success' },
  bad: { soft: 'border border-danger/40 bg-danger-soft text-danger', plain: 'text-danger' },
  neutral: { soft: 'border border-border bg-surface-2 text-text-subtle', plain: 'text-text-subtle' },
} as const;

/**
 * Signed change colored by good/bad, never by direction alone (BRAND §7.4). Arrow + sign always shown;
 * null → "—" (no previous period).
 */
export function DeltaBadge({ delta, kind, invert, variant = 'soft', size = 'sm', className }: DeltaBadgeProps) {
  const d = formatDelta(delta, kind, { invert });
  const Icon = d.direction === 'up' ? ArrowUpRight : d.direction === 'down' ? ArrowDownRight : Minus;
  const verdict = d.tone === 'good' ? 'improved' : d.tone === 'bad' ? 'worse' : d.direction === 'none' ? 'no previous data' : 'no change';
  return (
    <span
      title={d.direction === 'none' ? 'No data for the previous period' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-sm font-mono font-medium tnum',
        variant === 'soft' && (size === 'sm' ? 'h-5 px-1 text-2xs' : 'h-6 px-1.5 text-xs'),
        variant === 'plain' && (size === 'sm' ? 'text-xs' : 'text-[13px]'),
        tones[d.tone][variant],
        className,
      )}
    >
      {d.direction !== 'none' && <Icon size={size === 'sm' ? 12 : 14} strokeWidth={2} aria-hidden />}
      <span>{d.text}</span>
      <span className="sr-only">({verdict})</span>
    </span>
  );
}
