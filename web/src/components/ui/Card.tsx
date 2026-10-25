import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the standard 16px padding (use when not composing CardHeader/CardBody). */
  padded?: boolean;
  /** Hover affordance for clickable cards. */
  interactive?: boolean;
  as?: 'div' | 'section' | 'article';
}

/** Surface card: 1px border, 6px radius, no shadow (BRAND §10). */
export function Card({ padded, interactive, as: As = 'div', className, ...rest }: CardProps) {
  return (
    <As
      data-print="avoid-break"
      className={cn(
        'min-w-0 rounded-lg border border-border bg-surface',
        padded && 'p-4',
        interactive && 'transition-[border-color] duration-160 ease-out hover:border-border-strong',
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned controls (segmented control, "View all" link, InfoTip…). */
  actions?: ReactNode;
  /** Inline element after the title (InfoTip, Badge). */
  titleAddon?: ReactNode;
}

/** Card title row: H3 (16/600) + optional muted subtitle + actions. */
export function CardHeader({ title, subtitle, actions, titleAddon, className, ...rest }: CardHeaderProps) {
  return (
    // Wraps on narrow cards: wide actions (segmented controls) drop below the title instead of squeezing it to 0px.
    <div className={cn('flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4', className)} {...rest}>
      <div className="min-w-0 flex-[1_1_12rem]">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate font-sans text-base font-semibold text-text-strong">{title}</h3>
          {titleAddon}
        </div>
        {subtitle && <p className="mt-0.5 text-[13px] leading-[18px] text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-text-subtle', className)} {...rest} />;
}
