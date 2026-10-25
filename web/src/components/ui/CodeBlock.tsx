import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Copy text to the clipboard; `copied` flips true for 1.5s. */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for insecure contexts.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

export interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  /** Show the text label next to the icon. */
  showLabel?: boolean;
}

export function CopyButton({ text, label = 'Copy', className, showLabel }: CopyButtonProps) {
  const { copied, copy } = useCopy();
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      aria-label={showLabel ? undefined : copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text',
        copied && 'text-success hover:text-success',
        className,
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {showLabel && <span>{copied ? 'Copied' : label}</span>}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}

export interface CodeBlockProps {
  code: string;
  /** Small label in the header (e.g. "nginx", "llms.txt"). */
  language?: string;
  title?: string;
  /** Max height before scrolling (px). */
  maxHeight?: number;
  /** Soft-wrap long lines instead of horizontal scroll. */
  wrap?: boolean;
  className?: string;
}

/** Mono code panel on the sunken `well` with a copy button. */
export function CodeBlock({ code, language, title, maxHeight = 420, wrap, className }: CodeBlockProps) {
  return (
    <div className={cn('group relative min-w-0 overflow-hidden rounded-lg border border-border bg-well', className)}>
      {(title || language) && (
        <div className="flex h-9 items-center justify-between gap-2 border-b border-border pl-3 pr-1.5">
          <span className="truncate text-xs font-medium text-text-muted">{title ?? language}</span>
          <div className="flex items-center gap-2">
            {title && language && <span className="font-mono text-2xs text-text-subtle">{language}</span>}
            <CopyButton text={code} label="Copy code" showLabel />
          </div>
        </div>
      )}
      <pre
        className={cn('overflow-auto p-3 font-mono text-[12.5px] leading-5 text-text', wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre')}
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
      {!title && !language && <CopyButton text={code} label="Copy code" className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />}
    </div>
  );
}
