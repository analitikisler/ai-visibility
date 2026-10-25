import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Small inline spinner (inherits text color). Pass `label` when it stands alone. */
export function Spinner({ size = 16, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <LoaderCircle
      size={size}
      strokeWidth={1.75}
      className={cn('animate-spin motion-reduce:animate-none', className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
