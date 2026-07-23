import { Item, PatientCategory, Prisma } from '@prisma/client';

type PricedItem = Pick<
  Item,
  'priceDeserving' | 'pricePoor' | 'priceMember' | 'priceGeneral'
>;

/** Sole category→price mapping. Do not copy. */
export function resolveUnitPrice(
  item: PricedItem,
  category: PatientCategory,
): Prisma.Decimal {
  switch (category) {
    case PatientCategory.DESERVING:
      return item.priceDeserving;
    case PatientCategory.POOR:
      return item.pricePoor;
    case PatientCategory.MEMBER:
      return item.priceMember;
    case PatientCategory.GENERAL:
      return item.priceGeneral;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
