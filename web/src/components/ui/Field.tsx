import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label?: ReactNode;
  /** Muted help text under the control. */
  hint?: ReactNode;
  /** Error text; also marks the control invalid. */
  error?: ReactNode;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  required?: boolean;
  className?: string;
  /** Render prop receives ids to wire up the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label + control + hint/error, wired with ids (fields never rely on the border alone, BRAND §6.3). */
export function Field({ label, hint, error, hideLabel, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className={cn('text-xs font-medium text-text-muted', hideLabel && 'sr-only')}>
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </label>
      )}
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  'w-full min-w-0 rounded-md border border-border-strong bg-surface text-sm text-text placeholder:text-text-subtle transition-[border-color] duration-160 hover:border-text-subtle disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 aria-[invalid=true]:border-danger';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  icon?: LucideIcon;
  /** Element inside the right edge (unit, clear button). */
  trailing?: ReactNode;
  size?: 'sm' | 'md';
  /** Applied to the outer Field wrapper. */
  wrapperClassName?: string;
}

/** Text input with optional label/hint/error, leading icon and trailing slot. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel, icon: Icon, trailing, size = 'md', className, wrapperClassName, required, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative flex items-center">
          {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-2.5 text-text-subtle" />}
          <input
            ref={ref}
            id={rest.id ?? id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            className={cn(control, size === 'sm' ? 'h-7 px-2 text-[13px]' : 'h-8 px-2.5', Icon && (size === 'sm' ? 'pl-7' : 'pl-8'), trailing ? 'pr-9' : undefined, className)}
            {...rest}
          />
          {trailing && <div className="absolute right-1.5 flex items-center text-text-subtle">{trailing}</div>}
        </div>
      )}
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  mono?: boolean;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, hideLabel, mono, className, wrapperClassName, required, rows = 4, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={rest.id ?? id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={cn(control, 'resize-y px-2.5 py-2 leading-5', mono && 'font-mono text-[13px]', className)}
          {...rest}
        />
      )}
    </Field>
  );
});

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  options: SelectOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
  wrapperClassName?: string;
}

/** Native select (fully keyboard/screen-reader friendly) with token styling. */
export function Select<T extends string = string>({
  options,
  value,
  onChange,
  label,
  hint,
  error,
  hideLabel,
  icon: Icon,
  size = 'md',
  className,
  wrapperClassName,
  required,
  ...rest
}: SelectProps<T>) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} required={required} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative flex items-center">
          {Icon && <Icon size={14} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-2.5 text-text-subtle" />}
          <select
            id={rest.id ?? id}
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            className={cn(
              control,
              'appearance-none pr-8 font-medium',
              size === 'sm' ? 'h-7 pl-2 text-xs' : 'h-8 pl-2.5',
              Icon && (size === 'sm' ? 'pl-7' : 'pl-8'),
              className,
            )}
            {...rest}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute right-2.5 text-text-subtle" />
        </div>
      )}
    </Field>
  );
}
