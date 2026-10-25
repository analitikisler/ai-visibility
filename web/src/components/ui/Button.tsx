import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,box-shadow] duration-160 ease-out disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-text hover:border-text-strong hover:bg-surface-2',
  ghost: 'text-text-muted hover:bg-surface-2 hover:text-text',
  danger: 'border border-transparent bg-danger-soft text-danger hover:border-danger',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-sm',
};

const iconSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 16 };

/** Class string for button-looking elements (links, labels). */
export function buttonClasses(opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[opts.variant ?? 'secondary'], sizes[opts.size ?? 'md'], opts.className);
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Lucide icon shown before the label (replaced by a spinner while loading). */
  icon?: LucideIcon;
  /** Lucide icon shown after the label. */
  iconRight?: LucideIcon;
  children?: ReactNode;
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
}

/**
 * Button. One `primary` per view (BRAND §6.2); everything else `secondary` or `ghost`.
 * Labels are verb + object in sentence case ("Run check").
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  const s = iconSize[size];
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading ? <Spinner size={s} /> : Icon ? <Icon size={s} strokeWidth={1.75} aria-hidden /> : null}
      {children}
      {IconRight && <IconRight size={s} strokeWidth={1.75} aria-hidden />}
    </button>
  );
});

export interface ButtonLinkProps extends CommonProps, Omit<LinkProps, 'children'> {}

/** A react-router `<Link>` styled as a button. */
export function ButtonLink({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, className, children, ...rest }: ButtonLinkProps) {
  const s = iconSize[size];
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      {Icon && <Icon size={s} strokeWidth={1.75} aria-hidden />}
      {children}
      {IconRight && <IconRight size={s} strokeWidth={1.75} aria-hidden />}
    </Link>
  );
}
