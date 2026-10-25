import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { cn } from '@/lib/cn';
import { dayLabel, num, pct } from '@/lib/format';
import {
  axisLine,
  axisTick,
  ChartEmpty,
  ChartLegend,
  ChartTooltipBox,
  cursorStroke,
  formatTick,
  formatValue,
  gridStroke,
  niceMax,
  prefersReducedMotion,
  type SeriesDef,
  type ValueFormat,
} from './common';

type Row = Record<string, string | number | null | undefined>;

export interface StackedAreaChartProps {
  data: Row[];
  /** Bottom-to-top stacking order. */
  series: SeriesDef[];
  xKey?: string;
  format?: ValueFormat;
  height?: number;
  /** `area` (default) or daily stacked `bar`s. */
  variant?: 'area' | 'bar';
  /** 100% stacked: each day sums to 1 (tooltip shows share + value). */
  normalize?: boolean;
  legend?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Stacked composition over time (crawler visits by category, referrals by source, share of voice).
 * Segments are separated by 1–2px `surface` gaps.
 */
export function StackedAreaChart({
  data,
  series,
  xKey = 'day',
  format = 'number',
  height = 260,
  variant = 'area',
  normalize = false,
  legend = true,
  ariaLabel,
  className,
}: StackedAreaChartProps) {
  const rows = useMemo(() => {
    if (!normalize) return data;
    return data.map((r) => {
      const total = series.reduce((s, x) => s + (typeof r[x.key] === 'number' ? (r[x.key] as number) : 0), 0);
      const out: Row = { ...r, __total: total };
      for (const s of series) {
        const v = r[s.key];
        out[s.key] = typeof v === 'number' && total > 0 ? v / total : total > 0 ? 0 : null;
        out[`__raw_${s.key}`] = typeof v === 'number' ? v : null;
      }
      return out;
    });
  }, [data, series, normalize]);

  const max = useMemo(() => {
    if (normalize) return 1;
    let m = 0;
    for (const r of rows) {
      const sum = series.reduce((s, x) => s + (typeof r[x.key] === 'number' ? (r[x.key] as number) : 0), 0);
      if (sum > m) m = sum;
    }
    return niceMax(m, format);
  }, [rows, series, normalize, format]);

  const rowHasData = (r: Row) => series.some((s) => typeof r[s.key] === 'number' && (r[s.key] as number) > 0);
  const hasData = data.some(rowHasData);
  // An area needs two neighbouring days to draw anything: with only a day or two of data (a new project's first
  // check), stacked bars show the same numbers instead of an empty-looking plot.
  const bars = variant === 'bar' || data.filter(rowHasData).length < 3;
  const animate = !prefersReducedMotion();
  const fmt: ValueFormat = normalize ? 'percent' : format;

  const renderTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as Row | undefined;
    if (!row) return null;
    const list = [...series].reverse().map((s) => {
      const v = row[s.key];
      const raw = row[`__raw_${s.key}`];
      const value = normalize
        ? `${pct(typeof v === 'number' ? v : null)} · ${num(typeof raw === 'number' ? raw : null)}`
        : formatValue(typeof v === 'number' ? v : null, format);
      return { key: s.key, name: s.name, color: s.color, emphasis: s.emphasis, value };
    });
    const total = normalize ? (row.__total as number) : series.reduce((t, s) => t + (typeof row[s.key] === 'number' ? (row[s.key] as number) : 0), 0);
    // One series: its row already is the total.
    const footer = series.length > 1 ? `Total ${normalize ? num(total) : formatValue(total, format)}` : undefined;
    return <ChartTooltipBox title={dayLabel(String(label ?? row[xKey]))} rows={list} footer={footer} />;
  };

  if (!hasData) return <ChartEmpty height={height} />;

  const xAxis = (
    <XAxis dataKey={xKey} tickFormatter={(d: string) => dayLabel(d)} tick={axisTick} axisLine={axisLine} tickLine={false} minTickGap={24} tickMargin={8} />
  );
  const yAxis = (
    <YAxis
      domain={[0, max]}
      tickFormatter={(v: number) => formatTick(v, fmt)}
      tick={axisTick}
      axisLine={false}
      tickLine={false}
      width={44}
      // niceMax returns 1/2/2.5/5/10 × 10ⁿ, which splits evenly into 5 steps (money ticks: $0.10, $0.20…).
      tickCount={typeof fmt === 'function' ? 6 : 5}
      // Custom formats (money) need fractional ticks: a $0.20 axis would otherwise only show $0.
      allowDecimals={fmt === 'percent' || typeof fmt === 'function'}
    />
  );

  return (
    <div className={cn('min-w-0', className)}>
      {legend && series.length > 1 && <ChartLegend className="mb-3" items={[...series].reverse()} />}
      <div role="img" aria-label={ariaLabel ?? `Stacked trend of ${series.map((s) => s.name).join(', ')}`} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height }}>
          {bars ? (
            <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%" accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke={gridStroke} />
              {xAxis}
              {yAxis}
              <Tooltip wrapperStyle={{ zIndex: 10 }} content={renderTooltip} cursor={{ fill: 'var(--color-surface-2)' }} isAnimationActive={false} />
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="a"
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth={1}
                  radius={i === series.length - 1 ? [1, 1, 0, 0] : 0}
                  isAnimationActive={animate}
                  animationDuration={400}
                />
              ))}
            </BarChart>
          ) : (
            <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} stroke={gridStroke} />
              {xAxis}
              {yAxis}
              <Tooltip wrapperStyle={{ zIndex: 10 }} content={renderTooltip} cursor={cursorStroke} isAnimationActive={false} />
              {series.map((s) => (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  type="monotone"
                  stackId="a"
                  stroke="var(--color-surface)"
                  strokeWidth={1.5}
                  fill={s.color}
                  fillOpacity={0.9}
                  connectNulls={false}
                  isAnimationActive={animate}
                  animationDuration={400}
                  activeDot={{ r: 3.5, stroke: 'var(--color-surface)', strokeWidth: 2, fill: s.color }}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
