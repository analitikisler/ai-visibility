import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Optional inline action, e.g. { label: 'Undo', onClick }. */
  action?: { label: string; onClick: () => void };
  /** ms before auto-dismiss (default 5000; errors 8000). 0 keeps it until closed. */
  duration?: number;
}
interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  toast: (t: ToastInput) => number;
  success: (title: ReactNode, description?: ReactNode) => number;
  error: (title: ReactNode, description?: ReactNode) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const icons: Record<ToastTone, { icon: LucideIcon; cls: string }> = {
  success: { icon: CheckCircle2, cls: 'text-success' },
  error: { icon: XCircle, cls: 'text-danger' },
  warning: { icon: AlertTriangle, cls: 'text-warning' },
  info: { icon: Info, cls: 'text-info' },
};

/** Mount once near the root. Toasts stack bottom-right in a polite live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const region = useRef<HTMLDivElement>(null);
  // The region lives in the top layer (popover="manual") and is re-shown on every new toast so it
  // stacks above any modal <dialog> opened before it.
  useEffect(() => {
    const el = region.current;
    if (!el || typeof el.showPopover !== 'function') return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (items.length > 0) el.showPopover();
  }, [items.length, items[items.length - 1]?.id]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { ...t, id }]);
      const ms = t.duration ?? (t.tone === 'error' ? 8000 : 5000);
      if (ms > 0) window.setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
    }),
    [toast, dismiss],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        ref={region}
        popover="manual"
        aria-live="polite"
        aria-relevant="additions"
        data-print="hide"
        className="pointer-events-none fixed inset-auto bottom-4 left-4 right-4 z-[110] m-0 h-auto w-auto flex-col items-end gap-2 overflow-visible border-0 bg-transparent p-0 [&:popover-open]:flex sm:left-auto sm:w-96"
      >
        {items.map((t) => {
          const tone = icons[t.tone ?? 'info'];
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full animate-[pop-in_160ms_var(--ease-out)] items-start gap-3 rounded-lg border border-border bg-surface p-3 shadow-md"
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden className={cn('mt-0.5 shrink-0', tone.cls)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{t.title}</p>
                {t.description && <p className="mt-0.5 break-words text-[13px] text-text-muted">{t.description}</p>}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-1.5 text-[13px] font-medium text-accent hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="rounded-sm p-0.5 text-text-subtle hover:text-text">
                <X size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

/** `const toast = useToast(); toast.success('Draft approved')` · `toast.error("Couldn't save", errorMessage(e))`. */
export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
