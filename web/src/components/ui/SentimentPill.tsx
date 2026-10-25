import { Minus, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { SentimentLabel } from '@shared/types';
import { cn } from '@/lib/cn';
import { SENTIMENT_NAMES, sentimentLabel, sentimentScore } from '@/lib/format';

const meta: Record<SentimentLabel, { icon: LucideIcon; cls: string }> = {
  positive: { icon: ThumbsUp, cls: 'text-sent-pos' },
  neutral: { icon: Minus, cls: 'text-sent-neu' },
  negative: { icon: ThumbsDown, cls: 'text-sent-neg' },
};

export interface SentimentPillProps {
  /** Either a label… */
  label?: SentimentLabel | null;
  /** …or raw −1..1 sentiment (mapped to label + 0..100 score). */
  raw?: number | null;
  /** Show the 0..100 score after the label. */
  showScore?: boolean;
  /** Icon only (still has an accessible label). */
  compact?: boolean;
  className?: string;
}

/** Sentiment chip: icon + label (never color alone, BRAND §7.3). */
export function SentimentPill({ label, raw, showScore, compact, className }: SentimentPillProps) {
  const l = label ?? sentimentLabel(raw);
  if (!l) return <span className={cn('text-text-subtle', className)}>—</span>;
  const { icon: Icon, cls } = meta[l];
  const s = sentimentScore(raw);
  return (
    <span
      title={compact ? SENTIMENT_NAMES[l] : undefined}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-border bg-surface px-1.5 h-5 text-2xs font-medium text-text-muted', className)}
    >
      <Icon size={12} strokeWidth={2} aria-hidden className={cls} />
      {compact ? <span className="sr-only">{SENTIMENT_NAMES[l]}</span> : SENTIMENT_NAMES[l]}
      {showScore && s != null && <span className="font-mono text-text-subtle tnum">{s}</span>}
    </span>
  );
}
