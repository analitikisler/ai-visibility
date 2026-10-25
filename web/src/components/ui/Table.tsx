import { useMemo, useState, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

// ---------- Sorting ----------

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
type Accessor<T> = (row: T) => number | string | null | undefined;

/**
 * Client-side sorting for tables. Nulls always sort last.
 * ```tsx
 * const { rows, sortProps } = useSort(data, { visibility: r => r.visibility, name: r => r.name }, { key: 'visibility', dir: 'desc' });
 * <Th {...sortProps('visibility')}>Visibility</Th>
 * ```
 */
export function useSort<T, K extends string>(items: T[] | undefined, accessors: Record<K, Accessor<T>>, initial: SortState<NoInfer<K>>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const rows = useMemo(() => {
    const list = [...(items ?? [])];
    const get = accessors[sort.key];
    if (!get) return list;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      return String(va).localeCompare(String(vb)) * mul;
    });
    // accessors are expected to be stable in shape; sort changes are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort]);

  const sortProps = (key: K, firstDir: SortDir = 'desc') => ({
    sortDir: sort.key === key ? sort.dir : null,
    onSort: () => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir })),
  });
  return { rows, sort, setSort, sortProps };
}

// ---------- Primitives ----------

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Max height of the scroll area; the header sticks while rows scroll. */
  maxHeight?: number | string;
  /** 32px rows instead of 40px. */
  dense?: boolean;
  /** Classes for the scroll wrapper. */
  wrapperClassName?: string;
}

/** Scrollable table with sticky header, row hover and mono numeric cells. */
export function Table({ maxHeight, dense, className, wrapperClassName, children, ...rest }: TableProps) {
  return (
    <div className={cn('relative w-full overflow-auto', wrapperClassName)} style={maxHeight ? { maxHeight } : undefined} data-dense={dense || undefined}>
      <table className={cn('w-full border-separate border-spacing-0 text-[13px] leading-[18px]', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('sticky top-0 z-[1]', className)} {...rest} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Highlight (brand row → `primary-soft`). */
  highlight?: boolean;
  /** Pointer + hover for clickable rows (also make a cell a real link/button for keyboard users). */
  interactive?: boolean;
  selected?: boolean;
}

export function Tr({ highlight, interactive, selected, className, ...rest }: TrProps) {
  return (
    <tr
      className={cn(
        'group/row transition-colors duration-160',
        highlight || selected ? 'bg-primary-soft' : 'hover:bg-surface-2',
        interactive && 'cursor-pointer',
        className,
      )}
      {...rest}
    />
  );
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-align (numeric column). */
  num?: boolean;
  /** Current sort direction for this column, or null when sortable but inactive. Omit for non-sortable. */
  sortDir?: SortDir | null;
  onSort?: () => void;
}

export function Th({ num, sortDir, onSort, className, children, ...rest }: ThProps) {
  const sortable = onSort !== undefined;
  const Icon = sortDir === 'asc' ? ArrowUp : sortDir === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : sortable ? 'none' : undefined}
      className={cn(
        'h-9 whitespace-nowrap border-b border-border-strong bg-surface px-2.5 text-left text-xs font-medium text-text-muted first:pl-4 last:pr-4',
        num && 'text-right',
        className,
      )}
      {...rest}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn('inline-flex items-center gap-1 hover:text-text', num && 'flex-row-reverse', sortDir && 'text-text-strong')}
        >
          {children}
          <Icon size={12} strokeWidth={2} aria-hidden className={sortDir ? 'text-text' : 'opacity-60'} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Mono, right-aligned numeric cell. */
  num?: boolean;
  /** Muted secondary cell. */
  muted?: boolean;
}

export function Td({ num, muted, className, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'h-10 border-b border-border px-2.5 align-middle first:pl-4 last:pr-4 group-last/row:border-b-0 [[data-dense]_&]:h-8',
        num && 'text-right font-mono tnum',
        muted ? 'text-text-muted' : 'text-text',
        className,
      )}
      {...rest}
    />
  );
}

/** Full-width row for empty tables ("No prompts match these filters"). */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-text-subtle">
        {children}
      </td>
    </tr>
  );
}
