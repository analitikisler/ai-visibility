import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

/**
 * Shared native-<dialog> behavior: showModal() gives focus trapping, Esc, inert background and the
 * top layer for free. Closing via Esc or a backdrop click calls `onClose`; focus returns to the opener.
 * On open, focus moves to `[data-autofocus]` or the first form field (React's autoFocus doesn't fire here).
 */
function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      // showModal() focuses the first focusable element (the close button). Prefer an explicit
      // [data-autofocus] target, else the first form field, so users can type straight away.
      const target = d.querySelector<HTMLElement>(
        '[data-autofocus], input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])',
      );
      target?.focus();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    // The browser may still force-close (repeated Esc); keep React state in sync.
    const onNativeClose = () => {
      if (openRef.current) onClose();
    };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('close', onNativeClose);
    return () => {
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('close', onNativeClose);
    };
  }, [onClose]);
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return { ref, onBackdrop };
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row, right-aligned. Put the single primary action last. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

/** Modal dialog (6px radius, the overlay shadow, navy scrim). Esc / backdrop / close button all call `onClose`. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', className }: DialogProps) {
  const { ref, onBackdrop } = useNativeDialog(open, onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <dialog
      ref={ref}
      onClick={onBackdrop}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-lg border border-border bg-surface p-0 text-text shadow-lg backdrop:bg-overlay open:animate-[pop-in_160ms_var(--ease-out)] backdrop:open:animate-[fade-in_160ms_var(--ease-out)]',
        widths[size],
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[min(85dvh,52rem)] flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-text-strong">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-text-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-1.5 -mt-1" />
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'left';
  /** Tailwind max-width class, default `max-w-xl`. */
  widthClass?: string;
  /** Hide the built-in header (render your own inside children). */
  bare?: boolean;
  className?: string;
}

/** Side panel over the page (answer detail, filters, mobile nav). Same a11y behavior as Dialog. */
export function Drawer({ open, onClose, title, description, children, footer, side = 'right', widthClass = 'max-w-xl', bare, className }: DrawerProps) {
  const { ref, onBackdrop } = useNativeDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      onClick={onBackdrop}
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        'fixed inset-y-0 m-0 h-dvh max-h-dvh w-full border-border bg-surface p-0 text-text shadow-lg backdrop:bg-overlay backdrop:open:animate-[fade-in_160ms_var(--ease-out)]',
        side === 'right'
          ? 'left-auto right-0 border-l open:animate-[slide-in-right_220ms_var(--ease-out)]'
          : 'left-0 right-auto border-r open:animate-[slide-in-left_220ms_var(--ease-out)]',
        widthClass,
        className,
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          {!bare && (
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-base font-semibold text-text-strong">
                    {title}
                  </h2>
                )}
                {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
              </div>
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mr-1.5" />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
