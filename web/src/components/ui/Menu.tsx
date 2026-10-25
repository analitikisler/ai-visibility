import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { portalRoot, useFloating, type Align, type Side } from './floating';

export interface PopoverProps {
  /** Render the trigger; spread `props` onto a button. */
  trigger: (props: { ref: (el: HTMLElement | null) => void; onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' | 'dialog'; 'aria-controls': string }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  side?: Side;
  align?: Align;
  className?: string;
  role?: 'menu' | 'dialog';
  /** Accessible label for the panel. */
  label?: string;
  onOpenChange?: (open: boolean) => void;
}

/** Click-to-open floating panel (overlay shadow). Closes on outside click, Esc and blur-away. */
export function Popover({ trigger, children, side = 'bottom', align = 'start', className, role = 'dialog', label, onOpenChange }: PopoverProps) {
  const [open, setOpenState] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pos = useFloating(open, anchor, panel, side, align);

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const close = useCallback(() => {
    setOpen(false);
    anchor.current?.focus();
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, setOpen]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (!open || !pos) return;
    const first = panel.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"]), button, a, input, [tabindex="0"]');
    first?.focus();
  }, [open, pos]);

  return (
    <>
      {trigger({
        ref: (el) => {
          anchor.current = el;
        },
        onClick: () => setOpen(!open),
        'aria-expanded': open,
        'aria-haspopup': role,
        'aria-controls': id,
      })}
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role={role}
            aria-label={label}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className={cn('fixed z-[90] min-w-44 rounded-lg border border-border bg-surface p-1 text-sm text-text shadow-md', pos && 'animate-[pop-in_160ms_var(--ease-out)]', className)}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>,
          portalRoot(anchor.current),
        )}
    </>
  );
}

export interface MenuItemDef {
  key: string;
  label: ReactNode;
  icon?: LucideIcon;
  /** Muted right-side text (shortcut, count). */
  hint?: ReactNode;
  /** One muted line under the label (what the option does); the row grows to fit. */
  description?: ReactNode;
  onSelect?: () => void;
  /** Shows a check and uses role=menuitemradio. */
  selected?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuProps extends Omit<PopoverProps, 'children' | 'role'> {
  items: (MenuItemDef | 'separator' | { heading: ReactNode })[];
  /** Footer content (e.g. "New project" link). Receives close(). */
  footer?: (close: () => void) => ReactNode;
}

/** Dropdown menu with roving focus (↑/↓/Home/End, Enter/Space selects). */
export function Menu({ items, footer, ...popover }: MenuProps) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])'));
    const i = els.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % els.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + els.length) % els.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = els.length - 1;
    if (next < 0) return;
    e.preventDefault();
    els[next]?.focus();
  };
  const hasRadio = items.some((it) => typeof it === 'object' && 'key' in it && it.selected !== undefined);
  return (
    <Popover role="menu" {...popover}>
      {(close) => (
        <div onKeyDown={onKey}>
          {items.map((it, idx) => {
            if (it === 'separator') return <div key={`sep-${idx}`} role="separator" className="my-1 h-px bg-border" />;
            if ('heading' in it)
              return (
                <div key={`h-${idx}`} className="eyebrow px-2 pb-1 pt-2">
                  {it.heading}
                </div>
              );
            const Icon = it.icon;
            return (
              <div
                key={it.key}
                role={hasRadio ? 'menuitemradio' : 'menuitem'}
                aria-checked={hasRadio ? !!it.selected : undefined}
                aria-disabled={it.disabled || undefined}
                tabIndex={-1}
                onClick={() => {
                  if (it.disabled) return;
                  it.onSelect?.();
                  close();
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !it.disabled) {
                    e.preventDefault();
                    it.onSelect?.();
                    close();
                  }
                }}
                className={cn(
                  'flex cursor-pointer select-none gap-2 rounded-sm px-2 outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                  it.description ? 'items-start py-1.5' : 'h-8 items-center',
                  it.danger ? 'text-danger' : 'text-text',
                )}
              >
                {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className={cn('shrink-0', it.description && 'mt-0.5', it.danger ? 'text-danger' : 'text-text-muted')} />}
                {it.description ? (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.label}</span>
                    <span className="mt-0.5 block max-w-64 whitespace-normal text-xs leading-4 text-text-subtle">{it.description}</span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                )}
                {it.hint && <span className="text-xs text-text-subtle">{it.hint}</span>}
                {hasRadio && <Check size={14} strokeWidth={2} aria-hidden className={cn('text-accent', !it.selected && 'invisible')} />}
              </div>
            );
          })}
          {footer && (
            <>
              <div role="separator" className="my-1 h-px bg-border" />
              {footer(close)}
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
