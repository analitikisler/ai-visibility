import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts';
import { cn } from '@/lib/cn';
import { pct } from '@/lib/format';
import { ChartTooltipBox, formatValue, prefersReducedMotion, type ValueFormat } from './common';

export interface DonutDatum {
  key: string;
  name: string;
  value: number;
  color: string;
  emphasis?: boolean;
}

export interface DonutChartProps {
  data: DonutDatum[];
  /** Diameter in px. */
  size?: number;
  /** Ring thickness as a fraction of the radius (0..1). */
  thickness?: number;
  /** Center content (e.g. big brand share). */
  center?: ReactNode;
  /** Value format in the tooltip (shares are computed from the values). */
  format?: ValueFormat;
  /** Side legend with share per slice. */
  legend?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Share donut with 2px surface gaps between slices and an optional legend with percentages. */
export function DonutChart({ data, size = 168, thickness = 0.28, center, format = 'number', legend = true, ariaLabel, className }: DonutChartProps) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const slices = data.filter((d) => d.value > 0);
  const outer = size / 2;
  const inner = outer * (1 - thickness);

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as DonutDatum | undefined;
    if (!d) return null;
    return (
      <ChartTooltipBox
        rows={[{ key: d.key, name: d.name, color: d.color, emphasis: d.emphasis, value: `${pct(total ? d.value / total : null)} · ${formatValue(d.value, format)}` }]}
      />
    );
  };

  return (
    <div className={cn('flex min-w-0 flex-col items-center gap-5 sm:flex-row sm:items-center', className)}>
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={ariaLabel ?? `Share: ${slices.map((d) => `${d.name} ${pct(total ? d.value / total : null)}`).join(', ')}`}
      >
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: size, height: size }}>
            <PieChart accessibilityLayer={false}>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={inner}
                outerRadius={outer}
                startAngle={90}
                endAngle={-270}
                stroke="var(--color-surface)"
                strokeWidth={2}
                isAnimationActive={!prefersReducedMotion()}
                animationDuration={500}
              >
                {slices.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
              <Tooltip wrapperStyle={{ zIndex: 10 }} content={renderTooltip} isAnimationActive={false} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="size-full rounded-full border-[14px] border-surface-2" />
        )}
        {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
      </div>
      {legend && (
        <ul className="flex w-full min-w-0 flex-col gap-1.5">
          {data.map((d) => (
            <li key={d.key} className="flex min-w-0 items-center justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-xs" style={{ background: d.color }} />
                <span className={cn('truncate', d.emphasis ? 'font-semibold text-text' : 'text-text-muted')}>{d.name}</span>
              </span>
              <span className={cn('shrink-0 font-mono tnum', d.emphasis ? 'font-semibold text-text' : 'text-text')}>{pct(total ? d.value / total : null)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
