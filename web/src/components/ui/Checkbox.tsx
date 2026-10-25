import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** Native checkbox (keyboard + forms for free) with token styling. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate, onCheckedChange, className, id, checked, ...rest },
  ref,
) {
  const auto = useId();
  const cid = id ?? auto;
  const box = (
    <span className="relative inline-flex size-4 shrink-0">
      <input
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        id={cid}
        type="checkbox"
        checked={checked}
        aria-checked={indeterminate ? 'mixed' : undefined}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className="peer size-4 appearance-none rounded-sm border border-border-strong bg-surface transition-colors duration-160 checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary disabled:opacity-50"
        {...rest}
      />
      {indeterminate ? (
        <Minus size={12} strokeWidth={3} aria-hidden className="pointer-events-none absolute inset-0 m-auto text-primary-fg" />
      ) : (
        <Check size={12} strokeWidth={3} aria-hidden className="pointer-events-none absolute inset-0 m-auto text-primary-fg opacity-0 peer-checked:opacity-100" />
      )}
    </span>
  );
  if (!label) return <span className={className}>{box}</span>;
  return (
    <label htmlFor={cid} className={cn('inline-flex cursor-pointer items-start gap-2 text-sm text-text', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="mt-0.5">{box}</span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description && <span className="block text-xs text-text-subtle">{description}</span>}
      </span>
    </label>
  );
});

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Required when there is no visible label. */
  ariaLabel?: string;
}

/** On/off toggle (role=switch). Use for settings that apply immediately. */
export function Switch({ checked, onCheckedChange, label, description, disabled, size = 'md', className, ariaLabel }: SwitchProps) {
  const id = useId();
  const track = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const thumb = size === 'sm' ? 'size-3 data-[on=true]:translate-x-3' : 'size-4 data-[on=true]:translate-x-4';
  const btn = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-sm border p-px transition-colors duration-160 disabled:opacity-50',
        track,
        checked ? 'border-primary bg-primary' : 'border-border-strong bg-bg',
      )}
    >
      <span data-on={checked} className={cn('rounded-xs transition-[transform,background-color] duration-160 ease-out', checked ? 'bg-primary-fg' : 'bg-text-muted', thumb)} />
    </button>
  );
  if (!label) return <span className={className}>{btn}</span>;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer text-sm text-text">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-xs text-text-subtle">{description}</span>}
      </label>
      {btn}
    </div>
  );
}
