/** Paisa-safe helpers for display math (API still owns Decimal). */

export function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(n: number): string {
  return round2(n).toFixed(2);
}

export function lineQuantity(
  dose: number,
  feed: number,
  days: number,
  fixDose: number,
): number {
  if (fixDose > 0) return fixDose;
  return round2(dose * feed * days);
}

export function parseAvailableFromConflict(message: string): number | null {
  const m = message.match(/available\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  return toNum(m[1]);
}
