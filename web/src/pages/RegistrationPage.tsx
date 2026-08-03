import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { printSavedToken, reprintTokenById } from '../components/TokenPrintHost';
import { useHotkeys } from '../hooks/useHotkeys';
import { api } from '../lib/api';
import { CATEGORIES } from '../lib/categories';
import { money, toNum } from '../lib/money';
import type {
  HealthResponse,
  Patient,
  PatientCategory,
  RegistrationFee,
  StaffMember,
  Token,
} from '../types/api';
import { CategoryControl } from './reception/CategoryControl';
import { DoctorSelect } from './reception/DoctorSelect';
import type { LastRegistered } from './reception/handoff';
import { PatientPanel } from './reception/PatientPanel';

const BRANCH_CODE =
  (import.meta.env.VITE_BRANCH_CODE as string | undefined) || 'CH';

export function RegistrationPage() {
  const navigate = useNavigate();
  const patientSearchRef = useRef<HTMLInputElement>(null);
  const doctorRef = useRef<HTMLSelectElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [category, setCategory] = useState<PatientCategory>('GENERAL');
  const [doctorId, setDoctorId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastRegistered, setLastRegistered] = useState<LastRegistered | null>(
    null,
  );

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<HealthResponse>('/health'),
    refetchInterval: 10_000,
    retry: false,
  });
  const online = health.isSuccess && health.data?.ok === true;

  const doctors = useQuery({
    queryKey: ['staff', 'doctors'],
    queryFn: () => api<StaffMember[]>('/staff?doctors=true'),
  });

  const feeQuery = useQuery({
    queryKey: ['registration-fees', category],
    queryFn: () =>
      api<RegistrationFee>(
        `/registration-fees?category=${encodeURIComponent(category)}`,
      ),
    retry: false,
  });

  const feeMissing = feeQuery.isError;
  const feeAmount =
    feeQuery.isSuccess && feeQuery.data
      ? toNum(feeQuery.data.amount)
      : null;

  useEffect(() => {
    queueMicrotask(() => patientSearchRef.current?.focus());
  }, []);

  const cycleCategory = () => {
    const i = CATEGORIES.indexOf(category);
    setCategory(CATEGORIES[(i + 1) % CATEGORIES.length]);
  };

  const resetForm = useCallback(() => {
    setPatient(null);
    setShowNewPatient(false);
    setCategory('GENERAL');
    setDoctorId('');
    setSaveError(null);
    queueMicrotask(() => patientSearchRef.current?.focus());
  }, []);

  const saveDisabledReason = !online
    ? 'Server offline'
    : !patient
      ? 'Select a patient'
      : !doctorId
        ? 'Select a doctor'
        : feeMissing || feeAmount == null
          ? `No registration fee for ${category} — seed fees before saving`
          : feeQuery.isLoading
            ? 'Loading fee…'
            : '';

  const saveDisabled = saveDisabledReason.length > 0;

  const save = async () => {
    if (saveDisabled || saving || !patient || feeAmount == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = await api<Token>('/tokens/registration', {
        method: 'POST',
        body: {
          patientId: patient.id,
          doctorId,
          category,
        },
      });

      const handoffPatient = token.patient ?? patient;
      setLastRegistered({
        tokenId: token.id,
        tokenNo: token.tokenNo,
        handoff: {
          previousTokenId: token.id,
          tokenNo: token.tokenNo,
          patient: handoffPatient,
          category: token.category,
          doctorId: token.doctorId,
        },
      });
      printSavedToken(token);
      resetForm();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reprint = async () => {
    if (!lastRegistered) return;
    try {
      await reprintTokenById(lastRegistered.tokenId);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Reprint failed');
    }
  };

  const goDispense = () => {
    if (!lastRegistered) return;
    navigate('/dispense', { state: { handoff: lastRegistered.handoff } });
  };

  useHotkeys({
    F1: () => {
      setShowNewPatient(false);
      patientSearchRef.current?.focus();
    },
    F2: () => {
      setPatient(null);
      setShowNewPatient(true);
    },
    F4: () => cycleCategory(),
    F9: () => void save(),
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
      {!online && (
        <div className="mb-2 shrink-0 rounded-lg border-2 border-red-700 bg-red-600 px-3 py-2 text-base font-bold text-white">
          Cannot reach server. Do not continue — your work will not be saved.
        </div>
      )}

      {lastRegistered && (
        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
          <span>
            Token {BRANCH_CODE}-{lastRegistered.tokenNo} registered
          </span>
          <button
            type="button"
            className="text-primary underline hover:text-primary-hover"
            onClick={() => void reprint()}
          >
            Reprint
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1 text-white hover:bg-primary-hover"
            onClick={goDispense}
          >
            Dispense →
          </button>
        </div>
      )}

      {saveError && (
        <div className="mb-2 shrink-0 rounded-lg border border-red-700 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
          {saveError}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-xl min-h-0 flex-1 flex-col gap-2 overflow-auto">
        <PatientPanel
          patient={patient}
          onSelect={(p) => {
            setPatient(p);
            queueMicrotask(() => doctorRef.current?.focus());
          }}
          onClear={() => setPatient(null)}
          searchRef={patientSearchRef}
          showNewForm={showNewPatient}
          onToggleNew={setShowNewPatient}
          onActivity={() => undefined}
        />

        <div className="card-surface space-y-4 p-4">
          <CategoryControl value={category} onChange={setCategory} />
          <DoctorSelect
            doctors={doctors.data ?? []}
            value={doctorId}
            onChange={setDoctorId}
            selectRef={doctorRef}
          />

          <div className="border-t border-line pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registration fee
            </div>
            {feeQuery.isLoading ? (
              <div className="mt-1 text-lg text-slate-400">Loading…</div>
            ) : feeMissing || feeAmount == null ? (
              <div className="mt-1 rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                No registration fee configured for {category}. Save is disabled
                until fees are seeded for this branch.
              </div>
            ) : (
              <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-800">
                {money(feeAmount)}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Charged in full on save — no cart or partial payment.
            </p>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(30,42,84,0.06)]">
        <div className="mx-auto flex max-w-xl items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total due
            </div>
            <div className="text-2xl font-semibold tabular-nums text-slate-800">
              {feeAmount != null && !feeMissing ? money(feeAmount) : '—'}
            </div>
          </div>
          <div className="text-right">
            <button
              type="button"
              disabled={saveDisabled || saving}
              title={saveDisabled ? saveDisabledReason : 'Save & print (F9)'}
              className="h-12 rounded-lg bg-primary px-8 text-base font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'F9 · Save & print'}
            </button>
            {saveDisabled && (
              <div className="mt-1 text-xs font-medium text-slate-500">
                {saveDisabledReason}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
