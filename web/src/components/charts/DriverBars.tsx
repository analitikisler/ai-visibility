import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BRAND_COLOR, OTHER_COLOR } from '@/lib/colors';
import { MINUS } from '@/lib/format';

export interface DriverBarItem {
  id: string;
  name: ReactNode;
  /** Brand score 0..100. */
  score: number;
  /** Best competitor score 0..100. */
  leaderScore: number;
  leaderName: string;
  /** Extra element after the name (InfoTip). */
  addon?: ReactNode;
  onClick?: () => void;
}

export interface DriverBarsProps {
  items: DriverBarItem[];
  brandName: string;
  /** Color for a leader bar; resolve the competitor's entity color by name. Default slate. */
  leaderColor?: (leaderName: string) => string;
  /** Selected item (highlighted row). */
  selectedId?: string;
  className?: string;
}

/** Brand vs leader per driver (0..100): two thin bars per row plus the signed gap. */
export function DriverBars({ items, brandName, leaderColor, selectedId, className }: DriverBarsProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-xs" style={{ background: BRAND_COLOR }} />
          <span className="font-semibold text-text">{brandName}</span>
        </span>
        <span>vs. the leading competitor on each driver</span>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((d) => {
          const gap = Math.round(d.score - d.leaderScore);
          const lc = leaderColor?.(d.leaderName) ?? OTHER_COLOR;
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-text">
                  <span className="truncate">{d.name}</span>
                  {d.addon}
                </span>
                <span className={cn('shrink-0 font-mono text-xs tnum', gap > 0 ? 'text-success' : gap < 0 ? 'text-danger' : 'text-text-subtle')} title="Gap to leader">
                  {gap > 0 ? `+${gap}` : gap < 0 ? `${MINUS}${Math.abs(gap)}` : '0'}
                  <span className="sr-only"> points vs {d.leaderName}</span>
                </span>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                <div className="h-2 overflow-hidden rounded-xs bg-well" aria-hidden>
                  <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, d.score))}%`, background: BRAND_COLOR }} />
                </div>
                <span className="w-28 truncate text-right font-mono text-xs text-text tnum">
                  {Math.round(d.score)} <span className="font-sans text-text-subtle">You</span>
                </span>
                <div className="h-2 overflow-hidden rounded-xs bg-well" aria-hidden>
                  <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, d.leaderScore))}%`, background: lc }} />
                </div>
                <span className="w-28 truncate text-right font-mono text-xs text-text-muted tnum" title={d.leaderName}>
                  {Math.round(d.leaderScore)} <span className="font-sans text-text-subtle">{d.leaderName}</span>
                </span>
              </div>
            </>
          );
          const cls = cn('block w-full rounded-md px-2 py-2.5 text-left', selectedId === d.id && 'bg-primary-soft', d.onClick && 'transition-colors hover:bg-surface-2');
          return (
            <li key={d.id}>
              {d.onClick ? (
                <button type="button" onClick={d.onClick} aria-pressed={selectedId === d.id} className={cls}>
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
