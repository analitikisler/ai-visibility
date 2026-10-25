import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Required accessible name (also used as the native tooltip). */
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** Visually pressed state for toggles (sets aria-pressed). */
  pressed?: boolean;
}

const sizes = { sm: 'size-7', md: 'size-8', lg: 'size-10' } as const;
const iconSizes = { sm: 14, md: 16, lg: 20 } as const;
const variants = {
  ghost: 'text-text-muted hover:bg-surface-2 hover:text-text',
  secondary: 'border border-border-strong bg-surface text-text-muted hover:border-text-strong hover:bg-surface-2 hover:text-text',
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
} as const;

/** Square icon-only button. Always pass `label`. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', loading, pressed, className, disabled, type = 'button', title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-160 ease-out disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        variants[variant],
        pressed && 'bg-surface-2 text-text',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSizes[size]} /> : <Icon size={iconSizes[size]} strokeWidth={1.75} aria-hidden />}
    </button>
  );
});
