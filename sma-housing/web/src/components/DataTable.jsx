import { useMemo, useState } from 'react';
import {
  flexRender, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, useReactTable
} from '@tanstack/react-table';
import { Empty, Input } from './ui';

/* One table for every list in the app: sorting, a search box, and pagination.
   Rows are virtualised only by paging - these datasets are hundreds of rows,
   not millions, and paging keeps the DOM small without extra machinery.

   The table scrolls inside its own container so a wide column set never makes
   the whole page scroll sideways on a phone. */
export function DataTable({
  data, columns, initialSort = [], pageSize = 25,
  searchable = true, searchPlaceholder = 'Search…', onRowClick, empty, toolbar
}) {
  const [sorting, setSorting] = useState(initialSort);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data: useMemo(() => data || [], [data]),
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }
  });

  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  return (
    <div>
      {(searchable || toolbar) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchable && (
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="max-w-xs"
            />
          )}
          {toolbar}
          <span className="tnum ml-auto text-xs" style={{ color: 'var(--ink-soft)' }}>
            {total} {total === 1 ? 'record' : 'records'}
          </span>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b" style={{ borderColor: 'var(--line)' }}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th key={h.id}
                      className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--ink-soft)', width: h.column.columnDef.meta?.width }}
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
                      {h.isPlaceholder ? null : sortable ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 font-semibold uppercase hover:underline">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden="true">{dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : ''}</span>
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row.original); } : undefined}
                className={`border-b last:border-0 ${onRowClick ? 'cursor-pointer' : ''}`}
                style={{ borderColor: 'var(--line)' }}
                onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = 'var(--leaf-soft)'; }}
                onMouseLeave={(e) => { if (onRowClick) e.currentTarget.style.background = ''; }}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>{empty || 'No records match.'}</Empty>}
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="tnum text-xs" style={{ color: 'var(--ink-soft)' }}>
            Page {table.getState().pagination.pageIndex + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button className="field w-auto px-3 py-1 text-xs disabled:opacity-40"
              onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button>
            <button className="field w-auto px-3 py-1 text-xs disabled:opacity-40"
              onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
