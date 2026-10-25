import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'outline';

// Tally tags: 2px radius, 1px border, muted or status text on its tint. Never a filled pill.
const tones: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-2 text-text-muted',
  primary: 'border-accent/40 bg-accent-soft text-accent-ink',
  success: 'border-success/40 bg-success-soft text-success',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  danger: 'border-danger/40 bg-danger-soft text-danger',
  info: 'border-info/40 bg-info-soft text-accent-ink',
  accent: 'border-accent/40 bg-accent-soft text-accent-ink',
  outline: 'border-border-strong text-text-muted',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: LucideIcon;
  /** Colored 6px dot before the label (any CSS color, e.g. `var(--color-success)`). */
  dot?: string;
  size?: 'sm' | 'md';
  children?: ReactNode;
}

/** Small status/label chip (2px radius, 1px border, 12px medium). Status tones always pair with words or icons. */
export function Badge({ tone = 'neutral', icon: Icon, dot, size = 'sm', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border font-medium',
        size === 'sm' ? 'h-5 px-1.5 text-2xs' : 'h-6 px-2 text-xs',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full" style={{ background: dot }} />}
      {Icon && <Icon size={size === 'sm' ? 12 : 14} strokeWidth={1.75} aria-hidden />}
      {children}
    </span>
  );
}

/** Color swatch for legends and tables (identity, not status): a square cell, since only status dots are round. */
export function Dot({ color, className, size = 8 }: { color: string; className?: string; size?: number }) {
  return <span aria-hidden className={cn('inline-block shrink-0 rounded-xs', className)} style={{ background: color, width: size, height: size }} />;
}
