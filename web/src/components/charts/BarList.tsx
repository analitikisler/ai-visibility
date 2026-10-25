import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { formatValue, type ValueFormat } from './common';

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Bar color (token var). Defaults to slate. */
  color?: string;
  /** Pre-formatted value text (overrides `format`). */
  display?: ReactNode;
  /** Muted text after the label ("12 prompts · 3 engines"); hidden on phones. */
  meta?: ReactNode;
  /** Leading element (EngineMark, Dot, Badge). */
  icon?: ReactNode;
  /** Brand row: the tinted `accent-soft` ground (BRAND §7.1). */
  highlight?: boolean;
  /** Router link for the row. */
  to?: string;
  onClick?: () => void;
  /** Native title for the label (full URL etc.). */
  title?: string;
}

export interface BarListProps {
  items: BarListItem[];
  format?: ValueFormat;
  /** Scale max (defaults to the largest value). Use 1 for ratios to show absolute proportion. */
  max?: number;
  /** Show only the first N with a "Show all" toggle. */
  limit?: number;
  /** Header row labels ("Domain", "Citations"). */
  labelHeader?: ReactNode;
  valueHeader?: ReactNode;
  empty?: ReactNode;
  className?: string;
}

/** Ranked horizontal bars with ink labels and mono values (sources, agents, pages, engines). */
export function BarList({ items, format = 'number', max, limit, labelHeader, valueHeader, empty = 'Nothing to show yet', className }: BarListProps) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return <p className="py-6 text-center text-[13px] text-text-subtle">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 0);
  const shown = limit && !expanded ? items.slice(0, limit) : items;
  return (
    <div className={cn('min-w-0', className)}>
      {(labelHeader || valueHeader) && (
        <div className="mb-1 flex items-center justify-between px-2 text-xs font-medium text-text-muted">
          <span>{labelHeader}</span>
          <span>{valueHeader}</span>
        </div>
      )}
      <ul className="flex flex-col">
        {shown.map((it) => {
          const w = top > 0 ? Math.max(0, Math.min(1, it.value / top)) : 0;
          const content = (
            <>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  {it.icon}
                  <span className={cn('truncate text-[13px]', it.highlight ? 'font-semibold text-text' : 'text-text')} title={it.title}>
                    {it.label}
                  </span>
                  {it.meta && <span className="hidden truncate text-xs text-text-subtle sm:inline">{it.meta}</span>}
                </span>
                <span className="shrink-0 font-mono text-[13px] text-text tnum">{it.display ?? formatValue(it.value, format)}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-xs bg-well" aria-hidden>
                <div
                  className="h-full transition-[width] duration-220 ease-out"
                  style={{ width: `${w * 100}%`, minWidth: it.value > 0 ? 4 : 0, background: it.color ?? 'var(--color-chart-other)' }}
                />
              </div>
            </>
          );
          const rowCls = cn('block rounded-md px-2 py-2', it.highlight && 'bg-primary-soft', (it.to || it.onClick) && 'transition-colors hover:bg-surface-2');
          return (
            <li key={it.key}>
              {it.to ? (
                <Link to={it.to} className={rowCls}>
                  {content}
                </Link>
              ) : it.onClick ? (
                <button type="button" onClick={it.onClick} className={cn(rowCls, 'w-full text-left')}>
                  {content}
                </button>
              ) : (
                <div className={rowCls}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {limit && items.length > limit && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 px-2 text-xs font-medium text-accent hover:underline">
          {expanded ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
