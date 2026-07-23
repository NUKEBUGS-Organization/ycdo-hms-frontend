import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { api } from '../../lib/api';
import type {
  CreatePatientInput,
  Gender,
  Patient,
  PatientWithTokens,
} from '../../types/api';

type Props = {
  patient: Patient | null;
  onSelect: (p: Patient) => void;
  onClear: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  showNewForm: boolean;
  onToggleNew: (open: boolean) => void;
  onActivity: () => void;
};

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PatientPanel({
  patient,
  onSelect,
  onClear,
  searchRef,
  showNewForm,
  onToggleNew,
  onActivity,
}: Props) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 200);
  const [highlight, setHighlight] = useState(0);

  const search = useQuery({
    queryKey: ['patients', 'search', debounced],
    queryFn: () =>
      api<Patient[]>(`/patients/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length > 0 && !patient && !showNewForm,
  });

  const detail = useQuery({
    queryKey: ['patients', patient?.id],
    queryFn: () => api<PatientWithTokens>(`/patients/${patient!.id}`),
    enabled: !!patient?.id,
  });

  const results = search.data ?? [];

  useEffect(() => setHighlight(0), [results]);

  const lastVisit = detail.data?.tokens?.[0];

  if (patient) {
    return (
      <div className="card-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold leading-tight text-slate-800">
              {patient.name}
            </div>
            <div className="mt-1 font-mono text-sm tabular-nums text-slate-500">
              {patient.mrNo} · {patient.gender[0]}
              {patient.ageYears != null ? ` · ${patient.ageYears}y` : ''}
            </div>
            {patient.phone && (
              <div className="text-sm text-slate-600">{patient.phone}</div>
            )}
            <div className="mt-1 text-xs text-slate-400">
              Last visit:{' '}
              {lastVisit
                ? new Date(lastVisit.tokenDate).toLocaleDateString('en-PK', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'}
            </div>
          </div>
          <button
            type="button"
            className="h-9 rounded-lg border border-line px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={() => {
              onClear();
              setQ('');
              onToggleNew(false);
              queueMicrotask(() => searchRef.current?.focus());
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  if (showNewForm) {
    return (
      <NewPatientForm
        onCancel={() => {
          onToggleNew(false);
          queueMicrotask(() => searchRef.current?.focus());
        }}
        onCreated={(p) => {
          onSelect(p);
          onToggleNew(false);
          onActivity();
        }}
        onUseExisting={(p) => {
          onSelect(p);
          onToggleNew(false);
          onActivity();
        }}
        onActivity={onActivity}
      />
    );
  }

  return (
    <div className="card-surface relative p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Patient
        </div>
        <button
          type="button"
          className="text-sm font-semibold text-primary hover:text-primary-hover"
          onClick={() => onToggleNew(true)}
        >
          F2 · New patient
        </button>
      </div>
      <input
        ref={searchRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onActivity();
        }}
        placeholder="Search name, phone, CNIC, MR — or F2 for new"
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
            onSelect(results[highlight]);
            setQ('');
            onActivity();
          } else if (e.key === 'Escape') {
            setQ('');
          }
        }}
      />
      {debounced.trim() && (
        <ul className="absolute inset-x-4 z-20 mt-1 max-h-44 overflow-auto rounded-xl border border-line bg-white shadow-md">
          {search.isFetching && (
            <li className="px-3 py-2.5 text-sm text-slate-400">Searching…</li>
          )}
          {!search.isFetching && results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-slate-400">No matches</li>
          )}
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className={[
                  'flex w-full items-center justify-between border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0',
                  i === highlight ? 'bg-primary-light' : 'hover:bg-primary-light',
                ].join(' ')}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => {
                  onSelect(p);
                  setQ('');
                  onActivity();
                }}
              >
                <span className="font-medium text-slate-800">{p.name}</span>
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {p.mrNo}
                  {p.phone ? ` · ${p.phone}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewPatientForm({
  onCancel,
  onCreated,
  onUseExisting,
  onActivity,
}: {
  onCancel: () => void;
  onCreated: (p: Patient) => void;
  onUseExisting: (p: Patient) => void;
  onActivity: () => void;
}) {
  const [form, setForm] = useState<CreatePatientInput>({
    name: '',
    gender: 'FEMALE',
    ageYears: undefined,
    phone: '',
    cnic: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceCreate, setForceCreate] = useState(false);

  const phoneQ = useDebounced(form.phone?.trim() ?? '', 300);
  const cnicQ = useDebounced(form.cnic?.trim() ?? '', 300);

  const dupPhone = useQuery({
    queryKey: ['patients', 'dup', 'phone', phoneQ],
    queryFn: () =>
      api<Patient[]>(`/patients/search?q=${encodeURIComponent(phoneQ)}`),
    enabled: phoneQ.length >= 7,
  });
  const dupCnic = useQuery({
    queryKey: ['patients', 'dup', 'cnic', cnicQ],
    queryFn: () =>
      api<Patient[]>(`/patients/search?q=${encodeURIComponent(cnicQ)}`),
    enabled: cnicQ.length >= 5,
  });

  const duplicate = useMemo(() => {
    const phoneHit = (dupPhone.data ?? []).find((p) => p.phone === phoneQ);
    const cnicHit = (dupCnic.data ?? []).find((p) => p.cnic === cnicQ);
    return phoneHit ?? cnicHit ?? null;
  }, [dupPhone.data, dupCnic.data, phoneQ, cnicQ]);

  async function submit() {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (duplicate && !forceCreate) return;
    setBusy(true);
    setError(null);
    try {
      const body: CreatePatientInput = {
        name: form.name.trim(),
        gender: form.gender,
      };
      if (form.ageYears != null && form.ageYears !== ('' as unknown)) {
        body.ageYears = Number(form.ageYears);
      }
      if (form.phone?.trim()) body.phone = form.phone.trim();
      if (form.cnic?.trim()) body.cnic = form.cnic.trim();
      const created = await api<Patient>('/patients', {
        method: 'POST',
        body,
      });
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof CreatePatientInput>(
    key: K,
    value: CreatePatientInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
    setForceCreate(false);
    onActivity();
  }

  return (
    <div className="card-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">New patient</div>
        <button
          type="button"
          className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Name
          </span>
          <input
            autoFocus
            className="input-field mt-0.5"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Gender
          </span>
          <select
            className="input-field mt-0.5"
            value={form.gender}
            onChange={(e) => set('gender', e.target.value as Gender)}
          >
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Age (years)
          </span>
          <input
            type="number"
            min={0}
            max={150}
            className="input-field mt-0.5 tabular-nums"
            value={form.ageYears ?? ''}
            onChange={(e) =>
              set(
                'ageYears',
                e.target.value === '' ? undefined : Number(e.target.value),
              )
            }
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Phone
          </span>
          <input
            className="input-field mt-0.5"
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            CNIC
          </span>
          <input
            className="input-field mt-0.5"
            value={form.cnic ?? ''}
            onChange={(e) => set('cnic', e.target.value)}
          />
        </label>
      </div>

      {duplicate && !forceCreate && (
        <div className="mt-2 rounded-lg border border-amber-500 bg-amber-50 p-2.5 text-sm">
          <div className="font-semibold text-amber-950">
            ⚠ {duplicate.name} ({duplicate.mrNo}) has this{' '}
            {duplicate.phone === phoneQ ? 'phone number' : 'CNIC'}.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover"
              onClick={() => onUseExisting(duplicate)}
            >
              Use existing
            </button>
            <button
              type="button"
              className="h-10 rounded-lg border border-line px-3 text-sm font-semibold text-slate-700 hover:bg-white"
              onClick={() => setForceCreate(true)}
            >
              Create anyway
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-red-600 bg-red-50 px-2 py-1.5 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={busy || (!!duplicate && !forceCreate)}
        className="mt-3 h-11 w-full rounded-lg bg-primary text-base font-semibold text-white hover:bg-primary-hover disabled:bg-slate-200 disabled:text-slate-400"
        onClick={() => void submit()}
      >
        {busy ? 'Creating…' : 'Create patient'}
      </button>
    </div>
  );
}
