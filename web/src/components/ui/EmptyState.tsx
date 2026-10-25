import type { ReactNode } from 'react';
import { AlertTriangle, RotateCcw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/api';
import { Button } from './Button';

export interface EmptyStateProps {
  title: ReactNode;
  /** What's missing, why it matters (one or two sentences). */
  body?: ReactNode;
  /** Lucide icon shown on a 48px surface-2 tile (ignored when `illustration` is set). */
  icon?: LucideIcon;
  /** Art slot (theme-aware SVG illustration component). */
  illustration?: ReactNode;
  /** The one action that fixes it (primary Button / ButtonLink), plus optional secondary ones. */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Draw a dashed card around it (for empty sections inside a page). */
  bordered?: boolean;
  className?: string;
}

/** Empty state: title, body, one action (BRAND §4 "Empty states"). */
export function EmptyState({ title, body, icon: Icon, illustration, action, secondaryAction, size = 'md', bordered, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-2 px-4 py-6' : size === 'md' ? 'gap-3 px-6 py-10' : 'gap-4 px-6 py-16',
        bordered && 'rounded-lg border border-dashed border-border-strong bg-surface',
        className,
      )}
    >
      {illustration ? (
        <div className="mb-1 flex justify-center">{illustration}</div>
      ) : Icon ? (
        <div className="flex size-12 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
          <Icon size={24} strokeWidth={1.75} aria-hidden />
        </div>
      ) : null}
      <div className="max-w-md">
        <h3 className={cn('font-semibold text-text-strong', size === 'lg' ? 'text-xl' : 'text-base')}>{title}</h3>
        {body && <p className={cn('mt-1 text-text-muted', size === 'sm' ? 'text-[13px]' : 'text-sm')}>{body}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

export interface ErrorStateProps {
  /** Plain-words headline, e.g. "Couldn't load the overview". */
  title?: ReactNode;
  /** The thrown error (its message becomes the detail line) or custom detail text. */
  error?: unknown;
  detail?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  size?: 'sm' | 'md';
  bordered?: boolean;
  className?: string;
}

/** Error with the way out (BRAND §4 "Errors"): what happened, detail line, retry. */
export function ErrorState({ title = "Couldn't load this", error, detail, onRetry, retrying, size = 'md', bordered, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        size === 'sm' ? 'px-4 py-6' : 'px-6 py-10',
        bordered && 'rounded-lg border border-border bg-surface',
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
        <AlertTriangle size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <div className="max-w-md">
        <h3 className="text-base font-semibold text-text-strong">{title}</h3>
        <p className="mt-1 text-sm text-text-muted">{detail ?? (error ? errorMessage(error) : 'Try again in a moment.')}</p>
      </div>
      {onRetry && (
        <Button size="sm" icon={RotateCcw} onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </div>
  );
}
