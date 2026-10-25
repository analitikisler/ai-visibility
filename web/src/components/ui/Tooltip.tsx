import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { portalRoot, useFloating, type Side } from './floating';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  /** Delay before showing on hover (ms). Focus shows immediately. */
  delay?: number;
  className?: string;
  /** Class for the inline wrapper around the trigger. */
  triggerClassName?: string;
  disabled?: boolean;
}

/**
 * Hover/focus tooltip (shadow-md surface, BRAND §7.5). The trigger is wrapped in an inline span that
 * carries `aria-describedby`; keep the trigger itself focusable (button, link) for keyboard users.
 */
export function Tooltip({ content, children, side = 'top', delay = 200, className, triggerClassName, disabled }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pos = useFloating(open, anchor, floating, side, 'center');

  const show = (wait: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), wait);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (disabled || content == null || content === '') return <>{children}</>;
  return (
    <>
      <span
        ref={anchor}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => show(delay)}
        onMouseLeave={hide}
        onFocus={() => show(0)}
        onBlur={hide}
        className={cn('inline-flex max-w-full', triggerClassName)}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={floating}
            id={id}
            role="tooltip"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className={cn(
              'pointer-events-none fixed z-[100] max-w-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs leading-[18px] text-text shadow-md',
              pos && 'animate-[fade-in_160ms_var(--ease-out)]',
              className,
            )}
          >
            {content}
          </div>,
          portalRoot(anchor.current),
        )}
    </>
  );
}

export interface InfoTipProps {
  /** Glossary entry (`copy.glossary.metrics.visibilityScore`): shows `term` as title and `short` as body. */
  term?: { term: string; short: string };
  /** Tooltip body (when not using `term`). */
  content?: ReactNode;
  /** Optional bold first line. */
  title?: ReactNode;
  /** Accessible name for the icon button (defaults to "About this metric"). */
  label?: string;
  side?: Side;
  className?: string;
}

/** 14px info icon that explains a metric on hover/focus: `<InfoTip term={copy.glossary.metrics.shareOfVoice} />`. */
export function InfoTip({ term, content, title, label, side = 'top', className }: InfoTipProps) {
  const heading = title ?? term?.term;
  const body = content ?? term?.short;
  return (
    <Tooltip
      side={side}
      delay={100}
      content={
        <span className="block">
          {heading && <span className="mb-0.5 block font-semibold text-text-strong">{heading}</span>}
          <span className="block text-text-muted">{body}</span>
        </span>
      }
    >
      <button
        type="button"
        aria-label={label ?? (term ? `About ${term.term}` : 'About this metric')}
        className={cn('inline-flex size-4 items-center justify-center rounded-sm text-text-subtle transition-colors hover:text-text', className)}
      >
        <Info size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </Tooltip>
  );
}
