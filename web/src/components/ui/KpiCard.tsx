import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import type { DeltaKind } from '@/lib/format';
import { DeltaBadge } from './DeltaBadge';
import { Skeleton } from './Skeleton';
import { InfoTip } from './Tooltip';
import { Sparkline } from '../charts/Sparkline';

export interface GlossaryTerm {
  term: string;
  short: string;
  long?: string;
}

export interface KpiCardProps {
  /** Overline label ("Visibility score"). */
  label: ReactNode;
  /** Pre-formatted value ("42", "38%", "#2.4"). */
  value: ReactNode;
  /** Small muted unit after the value ("/100"). */
  unit?: ReactNode;
  delta?: number | null;
  deltaKind?: DeltaKind;
  invertDelta?: boolean;
  /** Comparison line under the delta ("vs prior 30 days"). */
  comparison?: ReactNode;
  /** Glossary entry for the InfoTip (`copy.glossary.metrics.visibilityScore`) or custom text. */
  info?: GlossaryTerm | ReactNode;
  /** Optional 32px sparkline in the brand color (null = gap). */
  trend?: (number | null)[];
  trendColor?: string;
  /** `hero` = 36px value for a lone headline KPI. */
  size?: 'default' | 'hero';
  loading?: boolean;
  /** Makes the whole tile a link. */
  to?: string;
  className?: string;
}

function isGlossary(v: unknown): v is GlossaryTerm {
  return !!v && typeof v === 'object' && 'term' in v && 'short' in v;
}

/**
 * KPI tile (BRAND §10.6): label + InfoTip, the value in the display face with a muted unit, delta chip,
 * comparison line, optional sparkline. 20px padding.
 */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaKind = 'score',
  invertDelta,
  comparison,
  info,
  trend,
  trendColor = 'var(--chart-1)',
  size = 'default',
  loading,
  to,
  className,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-center gap-1">
        <span className="eyebrow truncate">{label}</span>
        {info != null &&
          (isGlossary(info) ? <InfoTip term={info} /> : <InfoTip content={info} />)}
      </div>
      {loading ? (
        <>
          <Skeleton className={cn('mt-3', size === 'hero' ? 'h-10 w-28' : 'h-8 w-20')} />
          <Skeleton className="mt-3 h-4 w-24" />
        </>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-1">
              <span
                className={cn(
                  'font-display font-heading tracking-[-0.012em] text-text-strong tnum',
                  size === 'hero' ? 'text-4xl leading-10' : 'text-2xl leading-8',
                )}
              >
                {value}
              </span>
              {unit && <span className={cn('text-text-muted tnum', size === 'hero' ? 'text-xl' : 'text-sm')}>{unit}</span>}
            </div>
            {/* The sparkline only shows when the tile has room for it next to the figure (container query). */}
            {trend && trend.length > 1 && <Sparkline values={trend} color={trendColor} width={72} height={32} className="mb-1 hidden shrink-0 @[13rem]:block" />}
          </div>
          {(delta !== undefined || comparison) && (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {delta !== undefined && <DeltaBadge delta={delta} kind={deltaKind} invert={invertDelta} />}
              {comparison && <span className="min-w-0 text-xs text-text-subtle">{comparison}</span>}
            </div>
          )}
        </>
      )}
    </>
  );
  const cls = cn('@container block min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5', to && 'transition-[border-color] duration-160 hover:border-border-strong', className);
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-print="avoid-break">
      {body}
    </div>
  );
}
