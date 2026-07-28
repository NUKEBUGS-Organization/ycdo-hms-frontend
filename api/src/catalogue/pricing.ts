import { BranchItemPrice, PatientCategory, Prisma } from '@prisma/client';

type PricedRow = Pick<
  BranchItemPrice,
  'priceDeserving' | 'pricePoor' | 'priceMember' | 'priceGeneral'
>;

/** Sole category→price mapping. Do not copy — server-side only. */
export function resolveUnitPrice(
  price: PricedRow,
  category: PatientCategory,
): Prisma.Decimal {
  switch (category) {
    case PatientCategory.DESERVING:
      return price.priceDeserving;
    case PatientCategory.POOR:
      return price.pricePoor;
    case PatientCategory.MEMBER:
      return price.priceMember;
    case PatientCategory.GENERAL:
      return price.priceGeneral;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
