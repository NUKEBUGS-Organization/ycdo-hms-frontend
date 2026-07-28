import { round2 } from '../../lib/money';
import type { Item } from '../../types/api';

export type CartLine = {
  localId: string;
  itemId: string;
  name: string;
  tracksStock: boolean;
  dose: number;
  feed: number;
  days: number;
  fixDose: number;
  quantity: number;
  /** Server-resolved via BranchItemPrice — never computed in the browser. */
  unitPrice: number;
  lineTotal: number;
  purchasePrice: string;
  reservationId: string | null;
  error: string | null;
  availableHint: number | null;
};

export type DoseDraft = {
  item: Item;
  dose: string;
  feed: string;
  days: string;
  fixDose: string;
};

export type ReceivableFields = {
  guardianName: string;
  guardianPhone: string;
  recommendedBy: string;
  promisedDate: string;
};

export type LastSaved = {
  tokenId: string;
  tokenNo: number;
  label: string;
};

export function withUnitPrice(
  line: CartLine,
  unitPrice: number,
  purchasePrice?: string,
): CartLine {
  return {
    ...line,
    unitPrice,
    purchasePrice: purchasePrice ?? line.purchasePrice,
    lineTotal: round2(unitPrice * line.quantity),
  };
}
