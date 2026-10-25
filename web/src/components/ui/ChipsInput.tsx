import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Field } from './Field';

export interface ChipsInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  placeholder?: string;
  /** Max number of chips (extra entries are ignored). */
  max?: number;
  /** Max length of one chip. */
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

/** Split pasted/typed text on commas, semicolons and newlines; trims and drops empties. */
const splitEntries = (raw: string) =>
  raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Tag-style text input (aliases, other names). Enter or comma adds a chip, Backspace on an empty
 * field removes the last one, paste splits on commas/newlines. Duplicates (case-insensitive) are skipped.
 */
export function ChipsInput({ values, onChange, label, hint, error, hideLabel, placeholder, max = 20, maxLength = 120, disabled, className }: ChipsInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (entries: string[]) => {
    const seen = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const e of entries) {
      const v = e.slice(0, maxLength);
      if (!v || seen.has(v.toLowerCase()) || next.length >= max) continue;
      seen.add(v.toLowerCase());
      next.push(v);
    }
    if (next.length !== values.length) onChange(next);
  };
  const commit = () => {
    if (!draft.trim()) return;
    add(splitEntries(draft));
    setDraft('');
  };
  const remove = (i: number) => onChange(values.filter((_, k) => k !== i));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      if (!draft.trim()) {
        // Let an empty Enter submit the surrounding form.
        if (e.key === ',') e.preventDefault();
        return;
      }
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && values.length) {
      e.preventDefault();
      remove(values.length - 1);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!/[,;\n]/.test(text)) return;
    e.preventDefault();
    add(splitEntries(draft + text));
    setDraft('');
  };

  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      {({ id, describedBy, invalid }) => (
        <div
          onClick={() => inputRef.current?.focus()}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex min-h-8 w-full min-w-0 flex-wrap items-center gap-1 rounded-md border border-border-strong bg-surface px-1.5 py-1 transition-[border-color] duration-160 hover:border-text-subtle focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring aria-[invalid=true]:border-danger',
            disabled && 'cursor-not-allowed bg-surface-2 opacity-60',
          )}
        >
          {values.map((v, i) => (
            <span key={`${v}-${i}`} className="inline-flex h-6 max-w-full items-center gap-1 rounded-sm border border-border bg-surface-2 pl-1.5 pr-0.5 text-xs font-medium text-text">
              <span className="truncate">{v}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                aria-label={`Remove ${v}`}
                className="inline-flex size-5 items-center justify-center rounded-sm text-text-subtle transition-colors hover:bg-surface hover:text-text"
              >
                <X size={12} strokeWidth={2} aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commit}
            aria-describedby={describedBy}
            placeholder={values.length ? undefined : placeholder}
            maxLength={maxLength}
            className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm text-text outline-none placeholder:text-text-subtle focus-visible:outline-none"
          />
        </div>
      )}
    </Field>
  );
}
