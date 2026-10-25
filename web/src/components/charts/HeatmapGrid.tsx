import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { heatColor, heatStep } from '@/lib/colors';
import { pct } from '@/lib/format';
import { Tooltip } from '../ui/Tooltip';

export interface HeatAxisItem {
  key: string;
  label: ReactNode;
  /** Plain-text label for tooltips / aria. */
  text?: string;
}

export interface HeatmapGridProps {
  rows: HeatAxisItem[];
  columns: HeatAxisItem[];
  /** 0..1 value for a cell; null = no data. */
  getValue: (rowKey: string, colKey: string) => number | null | undefined;
  /** Cell label formatter (default percent). */
  format?: (v: number) => string;
  /** Optional detail line in the cell tooltip ("4 answers"). */
  getDetail?: (rowKey: string, colKey: string) => ReactNode;
  onCellClick?: (rowKey: string, colKey: string) => void;
  /** Hide numbers inside cells (color + tooltip only). */
  hideValues?: boolean;
  /** Header over the row labels ("Prompt"). */
  rowHeader?: ReactNode;
  /** Min width of the row label column (px). */
  rowLabelWidth?: number;
  legend?: boolean;
  className?: string;
}

/**
 * Label ink per heat step so text stays ≥ 5:1 (BRAND §7.2):
 * light → text on 0–5, white on 6–7; dark → text on 0–4, canvas ink on 5–7.
 */
function inkFor(step: number) {
  if (step >= 6) return 'text-white dark:text-bg';
  if (step === 5) return 'text-text dark:text-bg';
  return 'text-text';
}

const plain = (n: ReactNode) => (typeof n === 'string' ? n : '');

/** Rows × columns grid on the single-hue brand-blue ramp (e.g. prompt × engine visibility). */
export function HeatmapGrid({
  rows,
  columns,
  getValue,
  format = (v) => pct(v),
  getDetail,
  onCellClick,
  hideValues,
  rowHeader,
  rowLabelWidth = 220,
  legend = true,
  className,
}: HeatmapGridProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-[13px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-[1] bg-surface px-2 pb-1 text-left text-xs font-medium text-text-muted"
                style={{ minWidth: rowLabelWidth }}
              >
                {rowHeader}
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="min-w-16 px-1 pb-1 text-center text-xs font-medium text-text-muted">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="sticky left-0 z-[1] max-w-0 bg-surface px-2 text-left font-normal text-text" style={{ minWidth: rowLabelWidth }}>
                  <span className="block truncate" title={r.text}>
                    {r.label}
                  </span>
                </th>
                {columns.map((c) => {
                  const v = getValue(r.key, c.key);
                  const has = v != null && Number.isFinite(v);
                  const step = has ? heatStep(v) : 0;
                  const text = has ? format(v) : '—';
                  const detail = getDetail?.(r.key, c.key);
                  const name = `${r.text ?? plain(r.label)} · ${c.text ?? plain(c.label)}: ${text}`;
                  const cell = (
                    <span
                      className={cn(
                        'flex h-8 w-full items-center justify-center rounded-xs font-mono text-xs tnum',
                        has ? inkFor(step) : 'text-text-subtle',
                        onCellClick && 'cursor-pointer ring-inset hover:ring-2 hover:ring-border-strong',
                      )}
                      style={{ background: heatColor(step) }}
                    >
                      {hideValues ? <span className="sr-only">{text}</span> : text}
                    </span>
                  );
                  const tip = (
                    <span className="block">
                      <span className="block font-medium">{r.text ?? plain(r.label)}</span>
                      <span className="block text-text-muted">
                        {c.text ?? plain(c.label)}: <span className="font-mono text-text">{text}</span>
                      </span>
                      {detail && <span className="block text-text-subtle">{detail}</span>}
                    </span>
                  );
                  return (
                    <td key={c.key} className="p-0">
                      <Tooltip content={tip} triggerClassName="flex w-full" delay={80}>
                        {onCellClick ? (
                          <button type="button" className="w-full rounded-xs" onClick={() => onCellClick(r.key, c.key)} aria-label={name}>
                            {cell}
                          </button>
                        ) : (
                          <span className="w-full" role="img" aria-label={name}>
                            {cell}
                          </span>
                        )}
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legend && <HeatLegend className="mt-3" />}
    </div>
  );
}

/** Step legend for the heat ramp: "0% ▢▢▢▢▢▢▢▢ 100%". */
export function HeatLegend({ low = '0%', high = '100%', className }: { low?: ReactNode; high?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 text-2xs text-text-subtle', className)} aria-hidden>
      <span>{low}</span>
      <span className="flex gap-0.5">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((s) => (
          <span key={s} className="h-2.5 w-5 rounded-xs" style={{ background: heatColor(s) }} />
        ))}
      </span>
      <span>{high}</span>
    </div>
  );
}
