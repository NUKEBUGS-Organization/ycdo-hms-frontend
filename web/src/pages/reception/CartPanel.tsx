import { ShoppingCart, X } from 'lucide-react';
import { money } from '../../lib/money';
import type { CartLine } from './cartTypes';

type Props = {
  lines: CartLine[];
  idleWarning: 'soon' | 'expired' | null;
  onRemove: (localId: string) => void;
  onFixQuantity: (localId: string, qty: number) => void;
  onActivity: () => void;
};

export function CartPanel({
  lines,
  idleWarning,
  onRemove,
  onFixQuantity,
  onActivity,
}: Props) {
  return (
    <div className="card-surface flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Cart
      </div>

      {idleWarning === 'soon' && (
        <div className="border-b border-line bg-slate-50 px-4 py-2 text-sm text-slate-600">
          This token has been open a while — holds expire in 5 minutes.
        </div>
      )}
      {idleWarning === 'expired' && (
        <div className="border-b border-amber-500 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950">
          Stock holds released. Re-check availability before saving.
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-auto">
        {lines.length === 0 && (
          <li className="flex h-full min-h-32 flex-col items-center justify-center gap-2 px-4 py-8 text-slate-400">
            <ShoppingCart className="size-8 opacity-50" strokeWidth={1.5} />
            <span className="text-sm font-medium">Cart is empty</span>
            <span className="text-xs">Search an item to add (F3)</span>
          </li>
        )}
        {lines.map((line) => (
          <li
            key={line.localId}
            className={[
              'border-b border-line px-4 py-2.5',
              line.error ? 'bg-red-100' : '',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-slate-800">
                  {line.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-sm text-slate-500">
                  <span>
                    {line.fixDose > 0
                      ? `fix ${line.fixDose}`
                      : `${line.dose} × ${line.feed} × ${line.days} = ${line.quantity}`}
                    {'  '}@ {money(line.unitPrice)}
                  </span>
                  <span className="ml-auto font-semibold tabular-nums text-slate-800">
                    {money(line.lineTotal)}
                  </span>
                </div>
                {line.error && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-bold text-red-800">
                    <span>{line.error}</span>
                    <label className="flex items-center gap-1 font-semibold">
                      Qty
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        className="h-9 w-24 rounded-lg border-2 border-red-700 bg-white px-2 tabular-nums"
                        defaultValue={line.availableHint ?? line.quantity}
                        onFocus={onActivity}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const v = Number(
                              (e.target as HTMLInputElement).value,
                            );
                            if (v > 0) onFixQuantity(line.localId, v);
                          }
                        }}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v > 0 && v !== line.quantity) {
                            onFixQuantity(line.localId, v);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remove ${line.name}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => onRemove(line.localId)}
              >
                <X className="size-5" strokeWidth={2} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
