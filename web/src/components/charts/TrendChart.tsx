import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { cn } from '@/lib/cn';
import { dayLabel } from '@/lib/format';
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

export interface TrendChartProps {
  /** Daily rows: `{ day: 'YYYY-MM-DD', brand: 0.42, cmp_x: 0.31 }`; null = gap. */
  data: Row[];
  series: SeriesDef[];
  xKey?: string;
  /** Value format for axis + tooltip (`percent` expects 0..1). */
  format?: ValueFormat;
  height?: number;
  /** Fixed y-domain; default [0, nice max of visible data]. */
  yDomain?: [number, number];
  /** `toggle` renders a clickable legend that shows/hides series. */
  legend?: boolean | 'toggle';
  /** Controlled hidden keys (toggle mode). */
  hidden?: string[];
  onHiddenChange?: (hidden: string[]) => void;
  /** Accessible chart description. */
  ariaLabel?: string;
  /**
   * Trailing moving average over this many rows (days), computed client-side from the non-null
   * points in each window. Gap days stay gaps. Legend and tooltip are labelled "N-day avg".
   */
  rollingAvg?: number;
  className?: string;
}

/** Trailing mean per series over the last `window` rows, skipping nulls; a null day stays null. */
function rollingMean(data: Row[], keys: string[], window: number): Row[] {
  return data.map((row, i) => {
    const out: Row = { ...row };
    for (const key of keys) {
      if (typeof row[key] !== 'number') {
        out[key] = null;
        continue;
      }
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - window + 1); j <= i; j++) {
        const v = data[j]?.[key];
        if (typeof v === 'number') {
          sum += v;
          n++;
        }
      }
      out[key] = n ? sum / n : null;
    }
    return out;
  });
}

/**
 * Multi-series daily line chart. Brand (`emphasis`) is 2.5px, others 1.5px; nulls are gaps
 * (`connectNulls={false}`), isolated days get a dot so they don't vanish.
 */
export function TrendChart({
  data,
  series,
  xKey = 'day',
  format = 'number',
  height = 260,
  yDomain,
  legend = true,
  hidden: hiddenProp,
  onHiddenChange,
  ariaLabel,
  rollingAvg,
  className,
}: TrendChartProps) {
  const [hiddenState, setHiddenState] = useState<string[]>([]);
  const hiddenList = hiddenProp ?? hiddenState;
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  const toggle = (key: string) => {
    const next = hidden.has(key) ? hiddenList.filter((k) => k !== key) : [...hiddenList, key];
    if (onHiddenChange) onHiddenChange(next);
    else setHiddenState(next);
  };
  // Brand first in legend and drawn last (on top).
  const ordered = useMemo(() => [...series].sort((a, b) => Number(!!b.emphasis) - Number(!!a.emphasis)), [series]);
  const visible = ordered.filter((s) => !hidden.has(s.key));
  const smoothing = rollingAvg && rollingAvg > 1 ? Math.round(rollingAvg) : 0;
  const smoothLabel = smoothing ? `${smoothing}-day avg` : null;
  const plotted = useMemo(
    () => (smoothing ? rollingMean(data, series.map((s) => s.key), smoothing) : data),
    [data, series, smoothing],
  );

  const domain = useMemo<[number, number]>(() => {
    if (yDomain) return yDomain;
    let max = 0;
    for (const row of plotted) for (const s of visible) {
      const v = row[s.key];
      if (typeof v === 'number' && v > max) max = v;
    }
    return [0, niceMax(max, format)];
  }, [plotted, visible, yDomain, format]);

  const hasData = data.some((row) => series.some((s) => typeof row[s.key] === 'number'));
  const animate = !prefersReducedMotion();

  const renderTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as Row | undefined;
    if (!row) return null;
    const rows = visible
      .map((s) => ({ s, v: row[s.key] }))
      .sort((a, b) => (typeof b.v === 'number' ? b.v : -1) - (typeof a.v === 'number' ? a.v : -1))
      .map(({ s, v }) => ({ key: s.key, name: s.name, color: s.color, emphasis: s.emphasis, value: formatValue(typeof v === 'number' ? v : null, format) }));
    const day = dayLabel(String(label ?? row[xKey]));
    return <ChartTooltipBox title={smoothLabel ? `${day} · ${smoothLabel}` : day} rows={rows} />;
  };

  if (!hasData) return <ChartEmpty height={height} />;

  return (
    <div className={cn('min-w-0', className)}>
      {legend && series.length > 1 ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <ChartLegend items={ordered} hidden={legend === 'toggle' ? hidden : undefined} onToggle={legend === 'toggle' ? toggle : undefined} />
          {smoothLabel && <span className="shrink-0 pt-0.5 text-2xs font-medium text-text-subtle">{smoothLabel}</span>}
        </div>
      ) : (
        smoothLabel && <div className="mb-2 text-right text-2xs font-medium text-text-subtle">{smoothLabel}</div>
      )}
      <div role="img" aria-label={ariaLabel ?? `Trend of ${series.map((s) => s.name).join(', ')}`} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height }}>
          <LineChart data={plotted} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={gridStroke} />
            <XAxis
              dataKey={xKey}
              tickFormatter={(d: string) => dayLabel(d)}
              tick={axisTick}
              axisLine={axisLine}
              tickLine={false}
              minTickGap={24}
              tickMargin={8}
            />
            <YAxis
              domain={domain}
              tickFormatter={(v: number) => formatTick(v, format)}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              tickCount={5}
              allowDecimals={format !== 'number' && format !== 'compact'}
            />
            <Tooltip wrapperStyle={{ zIndex: 10 }} content={renderTooltip} cursor={cursorStroke} isAnimationActive={false} />
            {[...ordered].reverse().map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                type="monotone"
                stroke={s.color}
                strokeWidth={s.emphasis ? 2.5 : 1.5}
                hide={hidden.has(s.key)}
                connectNulls={false}
                isAnimationActive={animate}
                animationDuration={400}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface)', fill: s.color }}
                dot={(p: { cx?: number; cy?: number; index?: number }) => {
                  const i = p.index ?? -1;
                  const isNum = (r: Row | undefined) => typeof r?.[s.key] === 'number';
                  const isolated = isNum(plotted[i]) && !isNum(plotted[i - 1]) && !isNum(plotted[i + 1]);
                  if (!isolated || p.cx == null || p.cy == null) return <g key={`${s.key}-${i}`} />;
                  return <circle key={`${s.key}-${i}`} cx={p.cx} cy={p.cy} r={3} fill={s.color} />;
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
