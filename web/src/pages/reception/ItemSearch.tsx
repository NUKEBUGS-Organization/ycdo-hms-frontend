import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type RefObject } from 'react';
import { api } from '../../lib/api';
import { money, toNum } from '../../lib/money';
import type { Item, PatientCategory } from '../../types/api';
import type { DoseDraft } from './cartTypes';

type Props = {
  category: PatientCategory;
  draft: DoseDraft | null;
  onDraftChange: (d: DoseDraft | null) => void;
  onCommitDose: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  doseRef: RefObject<HTMLInputElement | null>;
  onActivity: () => void;
  resultsOpen: boolean;
  setResultsOpen: (v: boolean) => void;
};

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ItemSearch({
  category,
  draft,
  onDraftChange,
  onCommitDose,
  searchRef,
  doseRef,
  onActivity,
  resultsOpen,
  setResultsOpen,
}: Props) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 150);
  const [highlight, setHighlight] = useState(0);

  const search = useQuery({
    queryKey: ['items', 'search', debounced, category],
    queryFn: () =>
      api<Item[]>(
        `/items/search?q=${encodeURIComponent(debounced)}&patientCategory=${encodeURIComponent(category)}`,
      ),
    enabled: debounced.trim().length > 0 && !draft,
  });

  const results = search.data ?? [];

  useEffect(() => setHighlight(0), [results]);

  function selectItem(item: Item) {
    const avail = toNum(item.available);
    if (item.tracksStock && avail <= 0) return;
    onDraftChange({
      item,
      dose: '1',
      feed: '1',
      days: '1',
      fixDose: '0',
    });
    setResultsOpen(false);
    setQ('');
    onActivity();
    queueMicrotask(() => doseRef.current?.focus());
  }

  if (draft) {
    return (
      <div className="card-surface border-amber-200 bg-amber-50 p-4">
        <div className="mb-2 text-base font-semibold text-slate-800">
          {draft.item.name}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ['dose', 'Dose'],
              ['feed', 'Feed'],
              ['days', 'Days'],
              ['fixDose', 'Fix'],
            ] as const
          ).map(([key, label], idx) => (
            <label key={key} className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </span>
              <input
                ref={idx === 0 ? doseRef : undefined}
                type="number"
                min={0}
                step="any"
                className="input-field mt-0.5 tabular-nums"
                value={draft[key]}
                onChange={(e) => {
                  onDraftChange({ ...draft, [key]: e.target.value });
                  onActivity();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommitDose();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onDraftChange(null);
                    queueMicrotask(() => searchRef.current?.focus());
                  }
                }}
              />
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>Enter commits · Esc cancels</span>
          <span className="font-mono tabular-nums text-slate-700">
            unit {money(toNum(draft.item.unitPrice))}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface relative shrink-0 p-4">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Add item
      </div>
      <input
        ref={searchRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setResultsOpen(true);
          onActivity();
        }}
        onFocus={() => setResultsOpen(true)}
        placeholder="Type medicine name…"
        className="input-field h-11"
        onKeyDown={(e) => {
          if (!resultsOpen || results.length === 0) {
            if (e.key === 'Escape') setQ('');
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = results[highlight];
            if (item) selectItem(item);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setResultsOpen(false);
          }
        }}
      />
      {resultsOpen && debounced.trim() && (
        <ul className="absolute inset-x-4 z-20 mt-1 max-h-52 overflow-auto rounded-xl border border-line bg-white shadow-md">
          {search.isFetching && (
            <li className="px-3 py-2.5 text-sm text-slate-400">Searching…</li>
          )}
          {!search.isFetching && results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-slate-400">No items</li>
          )}
          {results.map((item, i) => {
            const avail = toNum(item.available);
            const oos = item.tracksStock && avail <= 0;
            const low = item.tracksStock && avail > 0 && avail < 10;
            // Highlight the server-resolved unit for current patient category
            const selected = item.unitPrice;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={oos}
                  className={[
                    'flex w-full flex-col gap-0.5 border-b border-line px-3 py-2.5 text-left last:border-b-0',
                    oos
                      ? 'cursor-not-allowed bg-slate-50 text-slate-400'
                      : i === highlight
                        ? 'bg-primary-light'
                        : 'hover:bg-primary-light',
                  ].join(' ')}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => selectItem(item)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {item.categoryName ?? ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums">
                    <span className="text-slate-500">
                      {(
                        [
                          ['DESERVING', item.priceDeserving],
                          ['POOR', item.pricePoor],
                          ['MEMBER', item.priceMember],
                          ['GENERAL', item.priceGeneral],
                        ] as const
                      ).map(([tier, price], idx) => (
                        <span key={tier}>
                          {idx > 0 ? ' / ' : ''}
                          <span
                            className={
                              price === selected
                                ? 'font-bold text-slate-800'
                                : ''
                            }
                          >
                            {money(toNum(price))}
                          </span>
                        </span>
                      ))}
                    </span>
                    {item.tracksStock && (
                      <span
                        className={
                          oos
                            ? 'font-bold'
                            : low
                              ? 'font-bold text-amber-700'
                              : 'text-slate-500'
                        }
                      >
                        {oos ? 'out of stock' : `${avail} avail`}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
