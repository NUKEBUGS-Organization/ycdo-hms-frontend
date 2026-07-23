/** Pakistan Standard Time — fixed UTC+5, no DST. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Current instant. Calendar interpretation elsewhere is always PKT. */
export function nowPkt(): Date {
  return new Date();
}

/**
 * Truncate to the PKT calendar day (00:00:00.000 PKT).
 * Pass any instant; the returned Date is midnight PKT for that day.
 */
export function pktDateOnly(d: Date): Date {
  const pkt = new Date(d.getTime() + PKT_OFFSET_MS);
  const y = pkt.getUTCFullYear();
  const m = pkt.getUTCMonth();
  const day = pkt.getUTCDate();
  return new Date(Date.UTC(y, m, day) - PKT_OFFSET_MS);
}
