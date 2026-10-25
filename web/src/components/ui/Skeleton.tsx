import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/** Loading placeholder block. Size it with classes (`h-4 w-24`) or `style`. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn('rounded-md bg-surface-2 animate-[shimmer_1.6s_ease-in-out_infinite]', className)} style={style} />;
}

/** Stack of text-line skeletons; the last line is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Card-shaped skeleton with a title bar and a body block of `height`. */
export function SkeletonCard({ height = 200, className }: { height?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('rounded-lg border border-border bg-surface p-4', className)}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </div>
  );
}
