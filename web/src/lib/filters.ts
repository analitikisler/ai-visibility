// Global dashboard filters live in the URL (`?days=30&engine=chatgpt`) so views are shareable and
// survive reloads. Read and write them only through `useFilters()`.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { EngineId } from '@shared/types';
import { isEngineId } from './engines';

export const DAY_OPTIONS = [7, 14, 30, 90] as const;
export type DayOption = (typeof DAY_OPTIONS)[number];
export const DEFAULT_DAYS: DayOption = 30;

export interface Filters {
  days: DayOption;
  engine: EngineId | undefined;
}

export function parseDays(v: string | null): DayOption {
  const n = Number(v);
  return (DAY_OPTIONS as readonly number[]).includes(n) ? (n as DayOption) : DEFAULT_DAYS;
}

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const days = parseDays(params.get('days'));
  const rawEngine = params.get('engine');
  const engine = isEngineId(rawEngine) ? rawEngine : undefined;

  const update = useCallback(
    (patch: Partial<{ days: DayOption; engine: EngineId | null }>) => {
      setParams(
        () => {
          // Start from the live URL, not the render's snapshot: two quick changes (period, then engine) before a
          // re-render would otherwise drop the first one.
          const next = new URLSearchParams(window.location.search);
          if (patch.days !== undefined) {
            if (patch.days === DEFAULT_DAYS) next.delete('days');
            else next.set('days', String(patch.days));
          }
          if (patch.engine !== undefined) {
            if (patch.engine) next.set('engine', patch.engine);
            else next.delete('engine');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setDays = useCallback((d: DayOption) => update({ days: d }), [update]);
  const setEngine = useCallback((e: EngineId | null) => update({ engine: e }), [update]);
  /** Query params ready to pass to aggregate hooks (`useOverview(id, filters.params)`). */
  const queryParams = useMemo(() => ({ days, engine }), [days, engine]);

  return { days, engine, setDays, setEngine, update, params: queryParams };
}

/** Current filter search string (`?days=7&engine=claude` or ''), to carry filters across nav links. */
export function useFilterSearch(): string {
  const [params] = useSearchParams();
  return useMemo(() => {
    const keep = new URLSearchParams();
    const d = params.get('days');
    const e = params.get('engine');
    if (d && parseDays(d) !== DEFAULT_DAYS) keep.set('days', d);
    if (isEngineId(e)) keep.set('engine', e);
    const s = keep.toString();
    return s ? `?${s}` : '';
  }, [params]);
}
