import { money, round2, toNum } from '../lib/money';
import { CATEGORY_LABEL } from '../lib/categories';
import type { Token } from '../types/api';

const HOSPITAL =
  (import.meta.env.VITE_BRANCH_NAME as string | undefined) ||
  'YCDO Central Hospital';
const BRANCH_CODE =
  (import.meta.env.VITE_BRANCH_CODE as string | undefined) || 'CH';
const BRANCH_PHONE =
  (import.meta.env.VITE_BRANCH_PHONE as string | undefined) || '051-111-9236';

function formatPktDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function genderShort(g: string | undefined): string {
  if (!g) return '—';
  return g[0] ?? '—';
}

type Props = {
  token: Token;
};

/** Print-only slip — hidden on screen, shown via @media print (80mm thermal). */
export function TokenPrintSlip({ token }: Props) {
  const lines = token.lines ?? [];
  const total = toNum(token.totalAmount);
  const received = toNum(token.amountReceived);
  const balance = round2(Math.max(total - received, 0));
  const patient = token.patient;
  const issuedAt = token.createdAt || token.tokenDate;

  return (
    <div className="token-print-slip">
      <header className="tps-header">
        <div className="tps-hospital">{HOSPITAL}</div>
        <div className="tps-branch">Branch {BRANCH_CODE}</div>
      </header>

      <div className="tps-token-no">
        TOKEN {BRANCH_CODE}-{token.tokenNo}
      </div>

      <div className="tps-datetime">{formatPktDateTime(issuedAt)} PKT</div>

      <section className="tps-block">
        <div className="tps-row">
          <span className="tps-label">Patient</span>
          <span className="tps-value">{patient?.name ?? '—'}</span>
        </div>
        <div className="tps-row">
          <span className="tps-label">MR No</span>
          <span className="tps-value">{patient?.mrNo ?? '—'}</span>
        </div>
        <div className="tps-row">
          <span className="tps-label">Age / Sex</span>
          <span className="tps-value">
            {patient?.ageYears != null ? `${patient.ageYears}y` : '—'} /{' '}
            {genderShort(patient?.gender)}
          </span>
        </div>
        <div className="tps-row">
          <span className="tps-label">Doctor</span>
          <span className="tps-value">{token.doctor?.fullName ?? '—'}</span>
        </div>
        <div className="tps-row">
          <span className="tps-label">Category</span>
          <span className="tps-value">{CATEGORY_LABEL[token.category]}</span>
        </div>
      </section>

      <table className="tps-lines">
        <thead>
          <tr>
            <th className="tps-item">Item</th>
            <th className="tps-num">Qty</th>
            <th className="tps-num">Rate</th>
            <th className="tps-num">Amt</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="tps-item">{line.item?.name ?? line.itemId}</td>
              <td className="tps-num">{String(line.quantity)}</td>
              <td className="tps-num">{money(toNum(line.unitPrice))}</td>
              <td className="tps-num">{money(toNum(line.lineTotal))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="tps-totals">
        <div className="tps-row tps-total">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
        <div className="tps-row">
          <span>Received</span>
          <span>{money(received)}</span>
        </div>
        <div className="tps-row">
          <span>Balance</span>
          <span>{money(balance)}</span>
        </div>
      </section>

      <footer className="tps-footer">
        {BRANCH_PHONE}
        <br />
        Thank you
      </footer>
    </div>
  );
}
