import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type RefObject } from 'react';
import { api } from '../../lib/api';
import { CATEGORY_LABEL } from '../../lib/categories';
import type { Patient, Token, TokenListResponse } from '../../types/api';
import type { DispenseHandoff } from './handoff';

const BRANCH_CODE =
  (import.meta.env.VITE_BRANCH_CODE as string | undefined) || 'CH';

type Props = {
  searchRef: RefObject<HTMLInputElement | null>;
  onLoad: (handoff: DispenseHandoff) => void;
};

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function parseTokenNo(raw: string): number | null {
  const cleaned = raw.trim().replace(new RegExp(`^${BRANCH_CODE}-`, 'i'), '');
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function todayIsoDate(): string {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pkt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DispenseLookup({ searchRef, onLoad }: Props) {
  const [mode, setMode] = useState<'patient' | 'token'>('patient');
  const [q, setQ] = useState('');
  const [tokenQ, setTokenQ] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [pickedPatient, setPickedPatient] = useState<Patient | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  const debounced = useDebounced(q, 200);

  const search = useQuery({
    queryKey: ['patients', 'search', debounced],
    queryFn: () =>
      api<Patient[]>(`/patients/search?q=${encodeURIComponent(debounced)}`),
    enabled: mode === 'patient' && !pickedPatient && debounced.trim().length > 0,
  });

  const patientTokens = useQuery({
    queryKey: ['tokens', 'by-patient', pickedPatient?.id],
    queryFn: () =>
      api<TokenListResponse>(
        `/tokens?patientId=${pickedPatient!.id}&limit=30`,
      ),
    enabled: !!pickedPatient?.id,
  });

  const results = search.data ?? [];
  const tokenRows = patientTokens.data?.data ?? [];

  useEffect(() => setHighlight(0), [results]);

  useEffect(() => {
    queueMicrotask(() => searchRef.current?.focus());
  }, [mode, searchRef]);

  async function loadTokenById(tokenId: string, fallbackPatient?: Patient) {
    setLookupError(null);
    setTokenBusy(true);
    try {
      const token = await api<Token>(`/tokens/${tokenId}`);
      if (!token.patient && !fallbackPatient) {
        setLookupError('Token has no patient attached');
        return;
      }
      onLoad({
        previousTokenId: token.id,
        tokenNo: token.tokenNo,
        patient: token.patient ?? fallbackPatient!,
        category: token.category,
        doctorId: token.doctorId,
      });
    } catch (e: unknown) {
      setLookupError(e instanceof Error ? e.message : 'Could not load token');
    } finally {
      setTokenBusy(false);
    }
  }

  async function lookupByTokenNo() {
    const tokenNo = parseTokenNo(tokenQ);
    if (tokenNo == null) {
      setLookupError('Enter a token number (e.g. 124 or CH-124)');
      return;
    }
    setLookupError(null);
    setTokenBusy(true);
    try {
      const today = todayIsoDate();
      let list = await api<TokenListResponse>(
        `/tokens?tokenNo=${tokenNo}&date=${encodeURIComponent(today)}&limit=5`,
      );
      if (list.data.length === 0) {
        list = await api<TokenListResponse>(
          `/tokens?tokenNo=${tokenNo}&limit=5`,
        );
      }
      if (list.data.length === 0) {
        setLookupError(`No token ${BRANCH_CODE}-${tokenNo} found`);
        return;
      }
      await loadTokenById(list.data[0].id);
    } catch (e: unknown) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setTokenBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <div className="card-surface p-4">
        <div className="mb-3 text-sm font-semibold text-slate-800">
          Load a token to dispense
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Open a registration (or earlier pharmacy) token — from the registration
          handoff, or look up by patient / token number.
        </p>

        <div className="mb-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={[
              'h-10 rounded-lg border text-sm font-semibold',
              mode === 'patient'
                ? 'border-primary bg-primary-light text-primary'
                : 'border-line bg-white text-slate-600',
            ].join(' ')}
            onClick={() => {
              setMode('patient');
              setPickedPatient(null);
              setLookupError(null);
            }}
          >
            Patient / MR
          </button>
          <button
            type="button"
            className={[
              'h-10 rounded-lg border text-sm font-semibold',
              mode === 'token'
                ? 'border-primary bg-primary-light text-primary'
                : 'border-line bg-white text-slate-600',
            ].join(' ')}
            onClick={() => {
              setMode('token');
              setPickedPatient(null);
              setLookupError(null);
            }}
          >
            Token number
          </button>
        </div>

        {mode === 'token' ? (
          <div className="flex gap-2">
            <input
              ref={searchRef}
              value={tokenQ}
              onChange={(e) => {
                setTokenQ(e.target.value);
                setLookupError(null);
              }}
              placeholder={`${BRANCH_CODE}-124 or 124`}
              className="input-field h-11 flex-1 font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void lookupByTokenNo();
                }
              }}
            />
            <button
              type="button"
              disabled={tokenBusy}
              className="h-11 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:bg-slate-200 disabled:text-slate-400"
              onClick={() => void lookupByTokenNo()}
            >
              {tokenBusy ? '…' : 'Open'}
            </button>
          </div>
        ) : !pickedPatient ? (
          <div className="relative">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, CNIC, MR"
              className="input-field h-11"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight((h) =>
                    Math.min(h + 1, Math.max(results.length - 1, 0)),
                  );
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === 'Enter' && results[highlight]) {
                  e.preventDefault();
                  setPickedPatient(results[highlight]);
                  setQ('');
                } else if (e.key === 'Escape') {
                  setQ('');
                }
              }}
            />
            {debounced.trim() && (
              <ul className="absolute inset-x-0 z-20 mt-1 max-h-44 overflow-auto rounded-xl border border-line bg-white shadow-md">
                {search.isFetching && (
                  <li className="px-3 py-2.5 text-sm text-slate-400">
                    Searching…
                  </li>
                )}
                {!search.isFetching && results.length === 0 && (
                  <li className="px-3 py-2.5 text-sm text-slate-400">
                    No matches
                  </li>
                )}
                {results.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={[
                        'flex w-full items-center justify-between border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0',
                        i === highlight
                          ? 'bg-primary-light'
                          : 'hover:bg-primary-light',
                      ].join(' ')}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => {
                        setPickedPatient(p);
                        setQ('');
                      }}
                    >
                      <span className="font-medium text-slate-800">
                        {p.name}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-400">
                        {p.mrNo}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-semibold text-slate-800">
                  {pickedPatient.name}
                </div>
                <div className="font-mono text-sm text-slate-500">
                  {pickedPatient.mrNo}
                </div>
              </div>
              <button
                type="button"
                className="h-9 rounded-lg border border-line px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setPickedPatient(null);
                  setLookupError(null);
                  queueMicrotask(() => searchRef.current?.focus());
                }}
              >
                Change
              </button>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recent tokens — pick one to dispense against
            </div>
            <ul className="mt-1 max-h-64 overflow-auto rounded-lg border border-line">
              {patientTokens.isLoading && (
                <li className="px-3 py-2.5 text-sm text-slate-400">Loading…</li>
              )}
              {!patientTokens.isLoading && tokenRows.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-slate-400">
                  No tokens for this patient — register them first.
                </li>
              )}
              {tokenRows.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={tokenBusy}
                    className="flex w-full items-center justify-between border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-primary-light disabled:opacity-50"
                    onClick={() => void loadTokenById(t.id, pickedPatient)}
                  >
                    <span>
                      <span className="font-mono font-semibold text-slate-800">
                        {BRANCH_CODE}-{t.tokenNo}
                      </span>
                      <span className="ml-2 text-slate-500">
                        {t.tokenType} · {CATEGORY_LABEL[t.category]}
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(t.tokenDate).toLocaleDateString('en-PK', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lookupError && (
          <div className="mt-3 rounded-lg border border-red-700 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
            {lookupError}
          </div>
        )}
      </div>
    </div>
  );
}
