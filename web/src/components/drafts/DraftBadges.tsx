// Small draft vocabulary shared by Actions, Diagnose and Readiness: kind icon, status and mode badges.
import { BadgeCheck, Braces, Check, CircleSlash, ClipboardList, Columns2, FileCode2, FilePen, FileText, LayoutTemplate, Mail, MessageCircleQuestion, type LucideIcon } from 'lucide-react';
import type { Draft, DraftKind } from '@shared/types';
import { Badge, Tooltip, type BadgeTone } from '@/components/ui';
import { copy } from '@/content/copy';

const D = copy.recommendations.drafts;

export const DRAFT_KINDS: DraftKind[] = ['llms_txt', 'comparison_page', 'faq_page', 'content_brief', 'robots_txt', 'schema_jsonld', 'outreach_email'];

export const DRAFT_KIND_ICONS: Record<DraftKind, LucideIcon> = {
  llms_txt: FileText,
  comparison_page: Columns2,
  faq_page: MessageCircleQuestion,
  content_brief: ClipboardList,
  robots_txt: FileCode2,
  schema_jsonld: Braces,
  outreach_email: Mail,
};

const STATUS: Record<Draft['status'], { tone: BadgeTone; icon?: LucideIcon }> = {
  draft: { tone: 'neutral', icon: FilePen },
  approved: { tone: 'info', icon: Check },
  published: { tone: 'success', icon: BadgeCheck },
  dismissed: { tone: 'outline', icon: CircleSlash },
};

/** Draft stays neutral until a person approves it (BRAND §10.8). */
export function DraftStatusBadge({ status }: { status: Draft['status'] }) {
  const s = STATUS[status];
  const badge = (
    <Badge tone={s.tone} icon={s.icon}>
      {D.status[status]}
    </Badge>
  );
  return status === 'draft' ? (
    <Tooltip content={copy.app.badges.draftTooltip}>
      <span tabIndex={0} className="inline-flex rounded-sm">
        {badge}
      </span>
    </Tooltip>
  ) : (
    badge
  );
}

/** Who wrote it: the live agent or a template (with the "add a key" explanation). */
export function DraftModeBadge({ mode }: { mode: Draft['mode'] }) {
  if (mode === 'llm') return <Badge tone="outline" icon={FilePen}>{D.mode.llm}</Badge>;
  return (
    <Tooltip content={D.mode.templateNote}>
      <span tabIndex={0} className="inline-flex rounded-sm">
        <Badge tone="outline" icon={LayoutTemplate}>
          {D.mode.template}
        </Badge>
      </span>
    </Tooltip>
  );
}

/** Kind icon in a 28px inset square (lists, menus). */
export function DraftKindIcon({ kind, size = 28 }: { kind: DraftKind; size?: number }) {
  const Icon = DRAFT_KIND_ICONS[kind];
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-muted" style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.55)} strokeWidth={1.75} />
    </span>
  );
}
