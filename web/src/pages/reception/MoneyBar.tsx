import type { RefObject } from 'react';
import { money } from '../../lib/money';
import type { ReceivableFields } from './cartTypes';

type Props = {
  total: number;
  received: string;
  onReceivedChange: (v: string) => void;
  balance: number;
  receivable: ReceivableFields;
  onReceivableChange: (r: ReceivableFields) => void;
  saveDisabled: boolean;
  saveDisabledReason: string;
  saving: boolean;
  onSave: () => void;
  receivedRef: RefObject<HTMLInputElement | null>;
  onActivity: () => void;
};

export function MoneyBar({
  total,
  received,
  onReceivedChange,
  balance,
  receivable,
  onReceivableChange,
  saveDisabled,
  saveDisabledReason,
  saving,
  onSave,
  receivedRef,
  onActivity,
}: Props) {
  const underpaid = balance > 0.001;

  return (
    <div className="shrink-0 border-t border-line bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(30,42,84,0.06)]">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total
          </div>
          <div className="text-2xl font-semibold tabular-nums text-slate-800">
            {money(total)}
          </div>
        </div>

        <label className="block">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Received
          </div>
          <input
            ref={receivedRef}
            type="number"
            min={0}
            step="0.01"
            className="input-field mt-0.5 h-12 w-40 text-2xl font-semibold tabular-nums"
            value={received}
            onFocus={onActivity}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onReceivedChange('');
                onActivity();
                return;
              }
              const n = Number(raw);
              if (!Number.isFinite(n)) return;
              if (n > total) return;
              onReceivedChange(raw);
              onActivity();
            }}
          />
        </label>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Balance
          </div>
          <div
            className={[
              'text-2xl font-semibold tabular-nums',
              underpaid ? 'text-amber-600' : 'text-slate-800',
            ].join(' ')}
          >
            {money(Math.max(balance, 0))}
          </div>
        </div>

        <div className="ml-auto">
          <button
            type="button"
            disabled={saveDisabled || saving}
            title={saveDisabled ? saveDisabledReason : 'Save & print (F9)'}
            className="h-12 rounded-lg bg-primary px-8 text-base font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'F9 · Save & print'}
          </button>
          {saveDisabled && (
            <div className="mt-1 text-right text-xs font-medium text-slate-500">
              {saveDisabledReason}
            </div>
          )}
        </div>
      </div>

      {underpaid && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 lg:grid-cols-4">
          {(
            [
              ['guardianName', 'Guardian name'],
              ['guardianPhone', 'Guardian phone'],
              ['recommendedBy', 'Recommended by'],
              ['promisedDate', 'Promised date'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </span>
              <input
                type={key === 'promisedDate' ? 'date' : 'text'}
                className="mt-0.5 h-11 w-full rounded-lg border border-amber-500 bg-amber-50 px-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                value={receivable[key]}
                onChange={(e) => {
                  onReceivableChange({ ...receivable, [key]: e.target.value });
                  onActivity();
                }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
