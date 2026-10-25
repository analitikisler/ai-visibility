import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  /** Small mono count after the label. */
  count?: number;
  disabled?: boolean;
}

/**
 * Read/write one tab value in the URL (`?tab=…`). Falls back to `fallback` when the param is
 * missing or not one of `allowed`. The default value is removed from the URL to keep links clean.
 */
export function useTabParam<T extends string>(param: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === fallback) next.delete(param);
          else next.set(param, v);
          return next;
        },
        { replace: true },
      ),
    [param, fallback, setParams],
  );
  return [value, set];
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onValueChange: (v: T) => void;
  /** Accessible label for the tab list. */
  label?: string;
  className?: string;
  /** id prefix: tab buttons get `${idBase}-tab-${value}`, panels should use `${idBase}-panel-${value}`. */
  idBase?: string;
}

/**
 * Underline tabs (role=tablist, arrow keys / Home / End). Pair with `useTabParam` for URL sync:
 * `const [tab, setTab] = useTabParam('tab', ['all','lost'], 'all'); <Tabs items={…} value={tab} onValueChange={setTab}/>`.
 * Render the active panel yourself, wrapped in `<TabPanel>`.
 */
export function Tabs<T extends string>({ items, value, onValueChange, label, className, idBase }: TabsProps<T>) {
  const auto = useId();
  const base = idBase ?? auto;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent) => {
    const enabled = items.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    const cur = items.findIndex((t) => t.value === value);
    const pos = enabled.indexOf(cur);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    onValueChange(items[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn('scrollbar-none flex gap-4 overflow-x-auto border-b border-border', className)}>
      {items.map((t, i) => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${base}-panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onValueChange(t.value)}
            className={cn(
              '-mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors duration-160 disabled:opacity-50',
              active ? 'border-accent text-text-strong' : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden />}
            {t.label}
            {t.count != null && (
              <span className={cn('rounded-sm border px-1 font-mono text-2xs tnum', active ? 'border-accent/40 bg-accent-soft text-accent-ink' : 'border-border bg-surface-2 text-text-subtle')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Panel for the active tab; pass the same `idBase` you gave `<Tabs>`. */
export function TabPanel({ idBase, value, className, children }: { idBase: string; value: string; className?: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} className={className}>
      {children}
    </div>
  );
}
