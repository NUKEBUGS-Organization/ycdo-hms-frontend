import { round2, toNum } from '../../lib/money';
import { resolveUnitPrice } from '../../lib/pricing';
import type { Item, PatientCategory } from '../../types/api';

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
  unitPrice: number;
  lineTotal: number;
  purchasePrice: string;
  priceDeserving: string;
  pricePoor: string;
  priceMember: string;
  priceGeneral: string;
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

export function repriceLine(
  line: CartLine,
  category: PatientCategory,
): CartLine {
  const unitPrice = toNum(resolveUnitPrice(line, category));
  return {
    ...line,
    unitPrice,
    lineTotal: round2(unitPrice * line.quantity),
  };
}
