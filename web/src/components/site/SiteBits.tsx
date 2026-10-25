// Small crawler vocabulary shared by AI crawlers, Integrations and Readiness.
import { AlertTriangle, ArrowRightLeft, CheckCircle2, XCircle } from 'lucide-react';
import type { AgentCategory } from '@shared/types';
import { Badge, Dot, InfoTip, type BadgeTone } from '@/components/ui';
import { copy } from '@/content/copy';
import { AGENT_CATEGORY_COLORS } from '@/lib/colors';

/** Fixed category order: AI first (training → search → user fetch → agents), then classic crawlers. */
export const AGENT_CATEGORIES: AgentCategory[] = ['training', 'search', 'user_fetch', 'agent', 'search_engine', 'seo_tool'];

/** Category swatch + label (identity color, never status). */
export function CategoryBadge({ category, info }: { category: AgentCategory; info?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-text-muted">
      <Dot color={AGENT_CATEGORY_COLORS[category]} />
      <span className="truncate">{copy.labels.agentCategory[category]}</span>
      {info && <InfoTip term={copy.glossary.agentCategories[category]} />}
    </span>
  );
}

const STATUS_CLASS: Record<'ok' | 'redirect' | 'client' | 'server', { tone: BadgeTone; icon: typeof CheckCircle2 }> = {
  ok: { tone: 'success', icon: CheckCircle2 },
  redirect: { tone: 'neutral', icon: ArrowRightLeft },
  client: { tone: 'warning', icon: AlertTriangle },
  server: { tone: 'danger', icon: XCircle },
};

export function statusClass(status: number | null | undefined): keyof typeof STATUS_CLASS | null {
  if (status == null) return null;
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  if (status >= 300) return 'redirect';
  return 'ok';
}

/** HTTP status chip: color + icon + code (never color alone). */
export function StatusCodeChip({ status }: { status: number | null | undefined }) {
  const cls = statusClass(status);
  if (!cls) return <span className="text-text-subtle">—</span>;
  const s = STATUS_CLASS[cls];
  return (
    <Badge tone={s.tone} icon={s.icon} className="font-mono">
      {status}
    </Badge>
  );
}
