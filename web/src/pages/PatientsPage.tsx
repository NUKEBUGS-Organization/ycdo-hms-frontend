import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type {
  Patient,
  PatientHistoryToken,
  PatientListResponse,
  PatientWithTokens,
  TokenType,
} from '../types/api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function genderLabel(g: Patient['gender']): string {
  if (g === 'MALE') return 'M';
  if (g === 'FEMALE') return 'F';
  return 'O';
}

function tokenTypeLabel(t: TokenType): string {
  switch (t) {
    case 'REGISTRATION':
      return 'Registration';
    case 'PHARMACY':
      return 'Pharmacy';
    case 'LAB':
      return 'Lab';
    case 'REFERRAL':
      return 'Referral';
    default:
      return t;
  }
}

function categoryLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function dosageSummary(line: PatientHistoryToken['lines'][number]): string {
  if (line.fixDose > 0) return `fix ${line.fixDose}`;
  const parts: string[] = [];
  if (line.dose > 0) parts.push(`${line.dose}`);
  if (Number(line.feed) > 0) parts.push(`×${line.feed}`);
  if (line.days > 0) parts.push(`${line.days}d`);
  return parts.length ? parts.join(' ') : '—';
}

function PatientHistory({
  patientId,
  onBack,
}: {
  patientId: string;
  onBack: () => void;
}) {
  const detail = useQuery({
    queryKey: ['patients', patientId, 'history'],
    queryFn: () => api<PatientWithTokens>(`/patients/${patientId}`),
  });

  const p = detail.data;
  const tokens = p?.tokens ?? [];

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="card-surface shrink-0 p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-slate-600 hover:bg-slate-50"
            aria-label="Back to patients"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {detail.isLoading && (
            <div className="py-1 text-sm text-slate-400">Loading…</div>
          )}
          {detail.isError && (
            <div className="py-1 text-sm text-rose-600">
              Could not load patient
            </div>
          )}
          {p && (
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold leading-tight text-slate-800">
                {p.name}
              </div>
              <div className="mt-1 font-mono text-sm tabular-nums text-slate-500">
                {p.mrNo} · {genderLabel(p.gender)}
                {p.ageYears != null ? ` · ${p.ageYears}y` : ''}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                {p.phone && <span>{p.phone}</span>}
                {p.cnic && (
                  <span className="font-mono text-xs tabular-nums">
                    {p.cnic}
                  </span>
                )}
                {p.address && (
                  <span className="text-slate-500">{p.address}</span>
                )}
                {p.guardianName && (
                  <span>
                    Guardian: {p.guardianName}
                    {p.guardianPhone ? ` (${p.guardianPhone})` : ''}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card-surface flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Visit history
          {!detail.isLoading && (
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
              {tokens.length} visit{tokens.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {detail.isLoading && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              Loading history…
            </div>
          )}
          {!detail.isLoading && tokens.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No visits yet
            </div>
          )}
          <ul className="divide-y divide-line">
            {tokens.map((t) => (
              <li
                key={`${t.tokenDate}-${t.tokenNo}`}
                className="px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-base font-semibold tabular-nums text-slate-800">
                    #{t.tokenNo}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {tokenTypeLabel(t.tokenType)}
                  </span>
                  <span className="text-sm tabular-nums text-slate-500">
                    {formatDate(t.tokenDate)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(t.createdAt)}
                  </span>
                  <span
                    className={
                      t.status === 'ACTIVE'
                        ? 'text-xs font-medium text-emerald-700'
                        : t.status === 'RETURNED'
                          ? 'text-xs font-medium text-amber-700'
                          : 'text-xs font-medium text-slate-400'
                    }
                  >
                    {t.status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {t.doctorName}
                  <span className="text-slate-400">
                    {' '}
                    · {categoryLabel(t.category)}
                  </span>
                </div>
                {t.lines.length > 0 && (
                  <table className="mt-2 w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400">
                        <th className="pb-1 font-medium">Item</th>
                        <th className="pb-1 font-medium">Dose</th>
                        <th className="pb-1 font-medium text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.lines.map((line, i) => (
                        <tr key={i} className="text-slate-700">
                          <td className="py-0.5 pr-3">{line.itemName}</td>
                          <td className="py-0.5 pr-3 tabular-nums text-slate-500">
                            {dosageSummary(line)}
                          </td>
                          <td className="py-0.5 text-right tabular-nums">
                            {line.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function PatientsPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 50;

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q), 200);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const list = useQuery({
    queryKey: ['patients', 'list', debounced, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (debounced.trim()) params.set('q', debounced.trim());
      return api<PatientListResponse>(`/patients?${params}`);
    },
    enabled: selectedId == null,
  });

  if (selectedId) {
    return (
      <PatientHistory
        patientId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="card-surface flex shrink-0 items-center gap-3 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, MR no, phone, CNIC…"
          className="input-field h-11 flex-1"
          autoFocus
        />
        <div className="shrink-0 text-sm tabular-nums text-slate-500">
          {list.isFetching
            ? 'Loading…'
            : `${total} patient${total === 1 ? '' : 's'}`}
        </div>
      </div>

      <div className="card-surface min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr className="border-b border-line">
              <th className="px-4 py-3">MR No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Sex</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">CNIC</th>
              <th className="px-4 py-3">Registered</th>
            </tr>
          </thead>
          <tbody>
            {list.isError && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-rose-600"
                >
                  Could not load patients
                </td>
              </tr>
            )}
            {!list.isError && !list.isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No patients found
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(p.id);
                  }
                }}
                className="cursor-pointer border-b border-line last:border-b-0 hover:bg-slate-50"
              >
                <td className="px-4 py-2.5 font-mono tabular-nums text-slate-700">
                  {p.mrNo}
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-800">
                  {p.name}
                </td>
                <td className="px-4 py-2.5 text-slate-600">
                  {genderLabel(p.gender)}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">
                  {p.ageYears != null ? `${p.ageYears}y` : '—'}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">
                  {p.phone ?? '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-600">
                  {p.cnic ?? '—'}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-500">
                  {formatDate(p.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-600 disabled:opacity-40"
            disabled={page <= 1 || list.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="tabular-nums text-slate-500">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="h-9 rounded-lg border border-line px-3 font-semibold text-slate-600 disabled:opacity-40"
            disabled={page >= totalPages || list.isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
