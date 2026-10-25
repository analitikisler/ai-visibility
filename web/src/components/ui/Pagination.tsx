import { ChevronLeft, ChevronRight } from 'lucide-react';
import { copy, fmt } from '@/content/copy';
import { cn } from '@/lib/cn';
import { num } from '@/lib/format';
import { Button } from './Button';

export interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  /** Dims the controls while the next page loads. */
  busy?: boolean;
  className?: string;
}

/** "1–20 of 312" with Previous / Next (offset-based, matches `Paged<T>`). */
export function Pagination({ total, limit, offset, onOffsetChange, busy, className }: PaginationProps) {
  if (total <= 0) return null;
  const from = Math.min(total, offset + 1);
  const to = Math.min(total, offset + limit);
  const P = copy.common.pagination;
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-3', className)}>
      <p className="font-mono text-xs text-text-muted tnum" aria-live="polite">
        {fmt(P.range, { from: num(from), to: num(to), total: num(total) })}
      </p>
      {total > limit && (
        <div className={cn('flex items-center gap-2', busy && 'opacity-60')}>
          <Button size="sm" icon={ChevronLeft} disabled={offset <= 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}>
            {P.previous}
          </Button>
          <Button size="sm" iconRight={ChevronRight} disabled={offset + limit >= total} onClick={() => onOffsetChange(offset + limit)}>
            {P.next}
          </Button>
        </div>
      )}
    </nav>
  );
}
