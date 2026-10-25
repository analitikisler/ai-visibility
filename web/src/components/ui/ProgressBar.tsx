import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  /** 0..1 ratio (ignored when `indeterminate`). */
  value?: number;
  /** Bar color: CSS color or one of the semantic tones. */
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  color?: string;
  size?: 'xs' | 'sm' | 'md';
  indeterminate?: boolean;
  /** Accessible label ("Run progress"). */
  label?: string;
  className?: string;
}

const toneCls = { primary: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-text-subtle' } as const;
const heights = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' } as const;

/** Thin horizontal progress / proportion bar on a sunken `well` track (square ends, Tally). */
export function ProgressBar({ value = 0, tone = 'primary', color, size = 'sm', indeterminate, label, className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn('relative w-full overflow-hidden rounded-xs bg-well', heights[size], className)}
    >
      {indeterminate ? (
        <div className={cn('absolute inset-y-0 w-2/5 animate-[indeterminate_1.2s_ease-in-out_infinite]', !color && toneCls[tone])} style={color ? { background: color } : undefined} />
      ) : (
        <div
          className={cn('h-full transition-[width] duration-220 ease-out', !color && toneCls[tone])}
          style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
        />
      )}
    </div>
  );
}
