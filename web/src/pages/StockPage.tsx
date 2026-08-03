import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { StockRow } from '../types/api';

function qty(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

export function StockPage() {
  const [q, setQ] = useState('');
  const [belowMin, setBelowMin] = useState(false);

  const stock = useQuery({
    queryKey: ['stock', belowMin],
    queryFn: () =>
      api<StockRow[]>(`/stock?belowMin=${belowMin ? 'true' : 'false'}`),
  });

  const rows = useMemo(() => {
    const all = stock.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((r) => r.itemName.toLowerCase().includes(term));
  }, [stock.data, q]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="card-surface flex shrink-0 flex-wrap items-center gap-3 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search item name…"
          className="input-field h-11 min-w-48 flex-1"
          autoFocus
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={belowMin}
            onChange={(e) => setBelowMin(e.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          Below minimum
        </label>
        <div className="shrink-0 text-sm tabular-nums text-slate-500">
          {stock.isFetching
            ? 'Loading…'
            : `${rows.length} item${rows.length === 1 ? '' : 's'}`}
        </div>
      </div>

      <div className="card-surface min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr className="border-b border-line">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Reserved</th>
              <th className="px-4 py-3 text-right">Available</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3 text-right">Max</th>
            </tr>
          </thead>
          <tbody>
            {stock.isError && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-rose-600"
                >
                  Could not load stock
                </td>
              </tr>
            )}
            {!stock.isError && !stock.isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No stock records
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const available = Number(r.available);
              const low =
                Number.isFinite(available) && available < r.minLimit;
              const empty =
                Number.isFinite(available) && available <= 0;
              return (
                <tr
                  key={r.itemId}
                  className={`border-b border-line last:border-b-0 ${
                    empty
                      ? 'bg-rose-50/60'
                      : low
                        ? 'bg-amber-50/50'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {r.itemName}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {qty(r.onHand)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {qty(r.reserved)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                      empty
                        ? 'text-rose-700'
                        : low
                          ? 'text-amber-800'
                          : 'text-slate-800'
                    }`}
                  >
                    {qty(r.available)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {r.minLimit}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {r.maxLimit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
