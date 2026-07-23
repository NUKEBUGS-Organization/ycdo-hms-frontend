import { useQuery } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { printSavedToken, reprintTokenById } from '../components/TokenPrintHost';
import { useHotkeys } from '../hooks/useHotkeys';
import { api, ApiError } from '../lib/api';
import {
  lineQuantity,
  money,
  parseAvailableFromConflict,
  round2,
  toNum,
} from '../lib/money';
import { CATEGORIES, resolveUnitPrice } from '../lib/pricing';
import type {
  HealthResponse,
  Patient,
  PatientCategory,
  ReservationCreateResult,
  StaffMember,
  Token,
} from '../types/api';
import { CartPanel } from './reception/CartPanel';
import { CategoryControl } from './reception/CategoryControl';
import {
  repriceLine,
  type CartLine,
  type DoseDraft,
  type LastSaved,
  type ReceivableFields,
} from './reception/cartTypes';
import { DoctorSelect } from './reception/DoctorSelect';
import { ItemSearch } from './reception/ItemSearch';
import { MoneyBar } from './reception/MoneyBar';
import { PatientPanel } from './reception/PatientPanel';

const BRANCH_CODE =
  (import.meta.env.VITE_BRANCH_CODE as string | undefined) ?? 'CH';

const IDLE_WARN_MS = 15 * 60 * 1000;
const HOLD_MS = 20 * 60 * 1000;

function newCartId() {
  return crypto.randomUUID();
}

export function ReceptionPage() {
  const patientSearchRef = useRef<HTMLInputElement>(null);
  const itemSearchRef = useRef<HTMLInputElement>(null);
  const doseRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLInputElement>(null);
  const doctorRef = useRef<HTMLSelectElement>(null);

  const [cartId, setCartId] = useState(newCartId);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [category, setCategory] = useState<PatientCategory>('GENERAL');
  const [doctorId, setDoctorId] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [draft, setDraft] = useState<DoseDraft | null>(null);
  const [itemResultsOpen, setItemResultsOpen] = useState(false);
  const [received, setReceived] = useState('0.00');
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [receivable, setReceivable] = useState<ReceivableFields>({
    guardianName: '',
    guardianPhone: '',
    recommendedBy: '',
    promisedDate: '',
  });
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [holdsExpired, setHoldsExpired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const cartIdRef = useRef(cartId);
  cartIdRef.current = cartId;

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

  const total = useMemo(
    () => round2(lines.reduce((s, l) => s + l.lineTotal, 0)),
    [lines],
  );

  useEffect(() => {
    if (!receivedTouched) {
      setReceived(money(total));
    }
  }, [total, receivedTouched]);

  const receivedNum = toNum(received);
  const balance = round2(total - receivedNum);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const idleMs = now - lastActivity;
  const idleWarning: 'soon' | 'expired' | null = holdsExpired
    ? 'expired'
    : idleMs >= IDLE_WARN_MS
      ? 'soon'
      : null;

  useEffect(() => {
    if (idleMs < HOLD_MS) return;
    if (lines.some((l) => l.reservationId)) {
      setHoldsExpired(true);
    }
  }, [idleMs, lines]);

  const bumpActivity = useCallback(async () => {
    setLastActivity(Date.now());
    setNow(Date.now());
    if (holdsExpired || idleMs >= IDLE_WARN_MS) {
      try {
        await api(`/reservations/cart/${cartIdRef.current}/touch`, {
          method: 'POST',
        });
        setHoldsExpired(false);
      } catch {
        /* offline handled by health bar */
      }
    }
  }, [holdsExpired, idleMs]);

  const releaseCart = useCallback(async (id: string) => {
    try {
      await api(`/reservations/cart/${id}`, { method: 'DELETE' });
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => patientSearchRef.current?.focus());
  }, []);

  useEffect(() => {
    return () => {
      void releaseCart(cartIdRef.current);
    };
  }, [releaseCart]);

  const resetToken = useCallback(async () => {
    await releaseCart(cartIdRef.current);
    const next = newCartId();
    setCartId(next);
    setPatient(null);
    setShowNewPatient(false);
    setCategory('GENERAL');
    setDoctorId('');
    setLines([]);
    setDraft(null);
    setReceived('0.00');
    setReceivedTouched(false);
    setReceivable({
      guardianName: '',
      guardianPhone: '',
      recommendedBy: '',
      promisedDate: '',
    });
    setSaveError(null);
    setHoldsExpired(false);
    setLastActivity(Date.now());
    queueMicrotask(() => itemSearchRef.current?.focus());
  }, [releaseCart]);

  const onCategoryChange = (c: PatientCategory) => {
    setCategory(c);
    setLines((prev) => prev.map((l) => repriceLine(l, c)));
    void bumpActivity();
  };

  const cycleCategory = () => {
    const i = CATEGORIES.indexOf(category);
    onCategoryChange(CATEGORIES[(i + 1) % CATEGORIES.length]);
  };

  const removeLine = async (localId: string) => {
    const line = lines.find((l) => l.localId === localId);
    setLines((prev) => prev.filter((l) => l.localId !== localId));
    void bumpActivity();
    if (line?.reservationId) {
      try {
        await api(`/reservations/${line.reservationId}`, { method: 'DELETE' });
      } catch {
        /* ignore */
      }
    }
    queueMicrotask(() => itemSearchRef.current?.focus());
  };

  const commitDose = async () => {
    if (!draft) return;
    const dose = toNum(draft.dose);
    const feed = toNum(draft.feed);
    const days = toNum(draft.days);
    const fixDose = toNum(draft.fixDose);
    const quantity = lineQuantity(dose, feed, days, fixDose);
    if (quantity <= 0) return;

    const unit = toNum(resolveUnitPrice(draft.item, category));
    const localId = crypto.randomUUID();
    const optimistic: CartLine = {
      localId,
      itemId: draft.item.id,
      name: draft.item.name,
      tracksStock: draft.item.tracksStock,
      dose,
      feed,
      days,
      fixDose,
      quantity,
      unitPrice: unit,
      lineTotal: round2(unit * quantity),
      purchasePrice: draft.item.purchasePrice,
      priceDeserving: draft.item.priceDeserving,
      pricePoor: draft.item.pricePoor,
      priceMember: draft.item.priceMember,
      priceGeneral: draft.item.priceGeneral,
      reservationId: null,
      error: null,
      availableHint: null,
    };

    setLines((prev) => [...prev, optimistic]);
    setDraft(null);
    void bumpActivity();
    queueMicrotask(() => itemSearchRef.current?.focus());

    if (!draft.item.tracksStock) return;

    try {
      const res = await api<ReservationCreateResult>('/reservations', {
        method: 'POST',
        body: {
          cartId: cartIdRef.current,
          itemId: draft.item.id,
          quantity,
        },
      });
      if (res.skipped) return;
      if (res.id) {
        setLines((prev) =>
          prev.map((l) =>
            l.localId === localId
              ? { ...l, reservationId: res.id!, error: null }
              : l,
          ),
        );
      }
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isConflict) {
        const msg = e.message;
        const avail = parseAvailableFromConflict(msg);
        setLines((prev) =>
          prev.map((l) =>
            l.localId === localId
              ? {
                  ...l,
                  error: avail != null ? `Only ${avail} available` : msg,
                  availableHint: avail,
                }
              : l,
          ),
        );
      } else {
        const msg = e instanceof Error ? e.message : 'Reservation failed';
        setLines((prev) =>
          prev.map((l) =>
            l.localId === localId ? { ...l, error: msg } : l,
          ),
        );
      }
    }
  };

  const fixQuantity = async (localId: string, qty: number) => {
    const line = lines.find((l) => l.localId === localId);
    if (!line) return;
    const quantity = round2(qty);
    if (quantity <= 0) return;

    if (line.reservationId) {
      try {
        await api(`/reservations/${line.reservationId}`, { method: 'DELETE' });
      } catch {
        /* ignore */
      }
    }

    setLines((prev) =>
      prev.map((l) =>
        l.localId === localId
          ? {
              ...l,
              quantity,
              fixDose: quantity,
              dose: 0,
              feed: 0,
              days: 0,
              lineTotal: round2(l.unitPrice * quantity),
              reservationId: null,
              error: null,
              availableHint: null,
            }
          : l,
      ),
    );
    void bumpActivity();

    if (!line.tracksStock) {
      queueMicrotask(() => itemSearchRef.current?.focus());
      return;
    }

    try {
      const res = await api<ReservationCreateResult>('/reservations', {
        method: 'POST',
        body: {
          cartId: cartIdRef.current,
          itemId: line.itemId,
          quantity,
        },
      });
      if (res.skipped) {
        queueMicrotask(() => itemSearchRef.current?.focus());
        return;
      }
      setLines((prev) =>
        prev.map((l) =>
          l.localId === localId
            ? { ...l, reservationId: res.id ?? null, error: null }
            : l,
        ),
      );
      queueMicrotask(() => itemSearchRef.current?.focus());
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isConflict) {
        const msg = e.message;
        const avail = parseAvailableFromConflict(msg);
        setLines((prev) =>
          prev.map((l) =>
            l.localId === localId
              ? {
                  ...l,
                  error: avail != null ? `Only ${avail} available` : msg,
                  availableHint: avail,
                }
              : l,
          ),
        );
      }
    }
  };

  const saveDisabledReason = !online
    ? 'Server offline'
    : !patient
      ? 'Select a patient'
      : !doctorId
        ? 'Select a doctor'
        : lines.length === 0
          ? 'Cart is empty'
          : lines.some((l) => l.error)
            ? 'Fix lines in error'
            : '';

  const saveDisabled = saveDisabledReason.length > 0;

  const save = async () => {
    if (saveDisabled || saving || !patient) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        cartId: cartIdRef.current,
        patientId: patient.id,
        doctorId,
        category,
        amountReceived: receivedNum,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          dose: l.dose,
          feed: l.feed,
          days: l.days,
          fixDose: l.fixDose,
        })),
      };
      if (balance > 0.001) {
        body.receivable = {
          guardianName: receivable.guardianName || undefined,
          guardianPhone: receivable.guardianPhone || undefined,
          recommendedBy: receivable.recommendedBy || undefined,
          promisedDate: receivable.promisedDate || undefined,
        };
      }

      const token = await api<Token>('/tokens', { method: 'POST', body });
      // Token is committed — print is best-effort and must never undo the save.
      setLastSaved({
        tokenId: token.id,
        tokenNo: token.tokenNo,
        label: `Token ${BRANCH_CODE}-${token.tokenNo} saved`,
      });
      printSavedToken(token);
      // Don't release cart — server consumed reservations. Just reset local.
      const next = newCartId();
      cartIdRef.current = next;
      setCartId(next);
      setPatient(null);
      setShowNewPatient(false);
      setCategory('GENERAL');
      setDoctorId('');
      setLines([]);
      setDraft(null);
      setReceived('0.00');
      setReceivedTouched(false);
      setReceivable({
        guardianName: '',
        guardianPhone: '',
        recommendedBy: '',
        promisedDate: '',
      });
      setHoldsExpired(false);
      setLastActivity(Date.now());
      queueMicrotask(() => itemSearchRef.current?.focus());
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isConflict) {
        const msg = e.message;
        const avail = parseAvailableFromConflict(msg);
        setLines((prev) =>
          prev.map((l) => {
            if (!l.tracksStock) return l;
            if (msg.toLowerCase().includes(l.name.toLowerCase())) {
              return {
                ...l,
                error: avail != null ? `Only ${avail} available` : msg,
                availableHint: avail,
              };
            }
            return l;
          }),
        );
        setSaveError(msg);
      } else {
        setSaveError(e instanceof Error ? e.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const abandon = async () => {
    if (
      !window.confirm(
        'Abandon this token? Stock holds will be released.',
      )
    ) {
      return;
    }
    setLastSaved(null);
    await resetToken();
    queueMicrotask(() => patientSearchRef.current?.focus());
  };

  const reprint = async () => {
    if (!lastSaved) return;
    try {
      await reprintTokenById(lastSaved.tokenId);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Reprint failed');
    }
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
    F3: () => itemSearchRef.current?.focus(),
    F4: () => cycleCategory(),
    F6: () => receivedRef.current?.focus(),
    F9: () => void save(),
    Escape: () => {
      if (draft) {
        setDraft(null);
        queueMicrotask(() => itemSearchRef.current?.focus());
        return;
      }
      setItemResultsOpen(false);
    },
    Delete: (e: KeyboardEvent) => {
      if (e.ctrlKey) void abandon();
    },
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
      {!online && (
        <div className="mb-2 shrink-0 rounded-lg border-2 border-red-700 bg-red-600 px-3 py-2 text-base font-bold text-white">
          Cannot reach server. Do not continue — your work will not be saved.
        </div>
      )}

      {lastSaved && (
        <div className="mb-2 flex shrink-0 items-center gap-3 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
          <span>{lastSaved.label}</span>
          <button
            type="button"
            className="text-primary underline hover:text-primary-hover"
            onClick={() => void reprint()}
          >
            Reprint
          </button>
        </div>
      )}

      {saveError && (
        <div className="mb-2 shrink-0 rounded-lg border border-red-700 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
          {saveError}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-2 overflow-auto">
          <PatientPanel
            patient={patient}
            onSelect={(p) => {
              setPatient(p);
              void bumpActivity();
              queueMicrotask(() => itemSearchRef.current?.focus());
            }}
            onClear={() => setPatient(null)}
            searchRef={patientSearchRef}
            showNewForm={showNewPatient}
            onToggleNew={setShowNewPatient}
            onActivity={() => void bumpActivity()}
          />
          <div className="card-surface space-y-3 p-4">
            <CategoryControl value={category} onChange={onCategoryChange} />
            <DoctorSelect
              doctors={doctors.data ?? []}
              value={doctorId}
              onChange={(id) => {
                setDoctorId(id);
                void bumpActivity();
              }}
              selectRef={doctorRef}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
          <CartPanel
            lines={lines}
            idleWarning={idleWarning}
            onRemove={(id) => void removeLine(id)}
            onFixQuantity={(id, qty) => void fixQuantity(id, qty)}
            onActivity={() => void bumpActivity()}
          />
          <ItemSearch
            category={category}
            draft={draft}
            onDraftChange={setDraft}
            onCommitDose={() => void commitDose()}
            searchRef={itemSearchRef}
            doseRef={doseRef}
            onActivity={() => void bumpActivity()}
            resultsOpen={itemResultsOpen}
            setResultsOpen={setItemResultsOpen}
          />
        </div>
      </div>

      <MoneyBar
        total={total}
        received={received}
        onReceivedChange={(v) => {
          setReceivedTouched(true);
          setReceived(v);
        }}
        balance={balance}
        receivable={receivable}
        onReceivableChange={setReceivable}
        saveDisabled={saveDisabled}
        saveDisabledReason={saveDisabledReason}
        saving={saving}
        onSave={() => void save()}
        receivedRef={receivedRef}
        onActivity={() => void bumpActivity()}
      />
    </section>
  );
}
