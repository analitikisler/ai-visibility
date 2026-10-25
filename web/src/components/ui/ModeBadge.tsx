import { FlaskConical } from 'lucide-react';
import type { EngineMode } from '@shared/types';
import { copy, fmt } from '@/content/copy';
import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

/** Neutral "Simulated" badge (BRAND §10.9): surface-2, muted text, FlaskConical 14px. */
export function SimulatedBadge({ className, tooltip = true }: { className?: string; tooltip?: boolean }) {
  const badge = (
    <span
      tabIndex={tooltip ? 0 : undefined}
      className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-border bg-surface-2 px-1.5 text-2xs font-medium text-text-muted', className)}
    >
      <FlaskConical size={12} strokeWidth={1.75} aria-hidden />
      {copy.app.badges.simulated}
    </span>
  );
  return tooltip ? <Tooltip content={copy.app.badges.simulatedTooltip}>{badge}</Tooltip> : badge;
}

/** "Live" with a 6px success dot. */
export function LiveBadge({ engineName, className, tooltip = true }: { engineName?: string; className?: string; tooltip?: boolean }) {
  const badge = (
    <span
      tabIndex={tooltip ? 0 : undefined}
      className={cn('inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-surface px-1.5 text-2xs font-medium text-text-muted', className)}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      {copy.app.badges.live}
    </span>
  );
  return tooltip ? <Tooltip content={fmt(copy.app.badges.liveTooltip, { engine: engineName ?? 'the engine' })}>{badge}</Tooltip> : badge;
}

/** Picks SimulatedBadge or LiveBadge from an engine/answer `mode`. */
export function ModeBadge({ mode, engineName, className, tooltip }: { mode: EngineMode; engineName?: string; className?: string; tooltip?: boolean }) {
  return mode === 'simulated' ? <SimulatedBadge className={className} tooltip={tooltip} /> : <LiveBadge engineName={engineName} className={className} tooltip={tooltip} />;
}
