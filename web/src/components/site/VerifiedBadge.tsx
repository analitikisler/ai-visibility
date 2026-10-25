// IP check of a crawler hit: icon + label + tooltip, never color alone.
import { BadgeCheck, ShieldAlert, ShieldQuestion, type LucideIcon } from 'lucide-react';
import type { BotEvent, BotVerification } from '@shared/types';
import { Badge, Tooltip, type BadgeTone } from '@/components/ui';
import { copy } from '@/content/copy';

export const VERIFICATIONS: BotVerification[] = ['verified', 'unverified', 'spoofed'];

const LOOK: Record<BotVerification, { tone: BadgeTone; icon: LucideIcon }> = {
  verified: { tone: 'success', icon: BadgeCheck },
  unverified: { tone: 'outline', icon: ShieldQuestion },
  spoofed: { tone: 'danger', icon: ShieldAlert },
};

/** An event's IP check; events from servers that only send `verified` fall back to it. */
export const verificationOf = (e: Pick<BotEvent, 'verified' | 'verification'>): BotVerification =>
  e.verification ?? (e.verified ? 'verified' : 'unverified');

/** Verified (IP in the operator's published ranges), unverified (can't tell) or spoofed (IP outside them). */
export function VerifiedBadge({ status }: { status: BotVerification }) {
  const V = copy.pages.crawlers.verification[status];
  const look = LOOK[status];
  return (
    <Tooltip content={V.tooltip}>
      <span tabIndex={0} className="inline-flex rounded-sm">
        <Badge tone={look.tone} icon={look.icon}>
          {V.label}
        </Badge>
      </span>
    </Tooltip>
  );
}
