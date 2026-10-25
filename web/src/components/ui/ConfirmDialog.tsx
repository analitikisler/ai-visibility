import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Input } from './Field';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` (default) for destructive actions; `primary` otherwise. */
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** Type-to-confirm: the confirm button stays disabled until this exact text is entered. */
  confirmText?: string;
  /** Label for the type-to-confirm field. */
  confirmTextLabel?: ReactNode;
  /** Extra content under the body (error line, details). */
  children?: ReactNode;
}

/** Small confirm step for destructive or irreversible actions (delete prompt, remove key, delete project). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  loading,
  confirmText,
  confirmTextLabel,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) setTyped('');
    // The native dialog focuses its first button; start in the type-to-confirm field when there is one.
    else inputRef.current?.focus();
  }, [open]);
  const blocked = confirmText !== undefined && typed.trim() !== confirmText.trim();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={body}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {(confirmText !== undefined || children) && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocked && !loading) onConfirm();
          }}
        >
          {confirmText !== undefined && (
            <Input ref={inputRef} label={confirmTextLabel} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          )}
          {children}
        </form>
      )}
    </Dialog>
  );
}
