import { CalendarRange, Layers } from 'lucide-react';
import type { EngineId } from '@shared/types';
import { copy } from '@/content/copy';
import { cn } from '@/lib/cn';
import { ENGINE_IDS, ENGINES } from '@/lib/engines';
import { DAY_OPTIONS, useFilters, type DayOption } from '@/lib/filters';
import { Select } from './Field';

export interface FilterBarProps {
  /** Engines to offer (defaults to all six). Pass the project's engines. */
  engines?: EngineId[];
  showRange?: boolean;
  showEngine?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Period + engine selectors bound to the URL (`?days&engine`) via `useFilters()`. */
export function FilterBar({ engines = ENGINE_IDS, showRange = true, showEngine = true, size = 'sm', className }: FilterBarProps) {
  const { days, engine, setDays, setEngine } = useFilters();
  const engineOptions = [
    { value: '', label: copy.filters.engine.all },
    ...ENGINE_IDS.filter((e) => engines.includes(e) || e === engine).map((e) => ({ value: e, label: ENGINES[e].name })),
  ];
  return (
    <div className={cn('flex items-center gap-2', className)} role="group" aria-label="Filters">
      {showRange && (
        <Select<string>
          size={size}
          label={copy.filters.range.label}
          hideLabel
          icon={CalendarRange}
          value={String(days)}
          onChange={(v) => setDays(Number(v) as DayOption)}
          options={DAY_OPTIONS.map((d) => ({ value: String(d), label: copy.filters.range.options[d] }))}
          className="w-[9.5rem]"
        />
      )}
      {showEngine && (
        <Select<string>
          size={size}
          label={copy.filters.engine.label}
          hideLabel
          icon={Layers}
          value={engine ?? ''}
          onChange={(v) => setEngine((v || null) as EngineId | null)}
          options={engineOptions}
          className="w-[9.5rem]"
        />
      )}
    </div>
  );
}
