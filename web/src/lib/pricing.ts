import type { Item, PatientCategory } from '../types/api';

/** Mirror of API resolveUnitPrice — only place category→price may live in web. */
export function resolveUnitPrice(
  item: Pick<
    Item,
    'priceDeserving' | 'pricePoor' | 'priceMember' | 'priceGeneral'
  >,
  category: PatientCategory,
): string {
  switch (category) {
    case 'DESERVING':
      return item.priceDeserving;
    case 'POOR':
      return item.pricePoor;
    case 'MEMBER':
      return item.priceMember;
    case 'GENERAL':
      return item.priceGeneral;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export const CATEGORIES: PatientCategory[] = [
  'DESERVING',
  'POOR',
  'MEMBER',
  'GENERAL',
];

export const CATEGORY_LABEL: Record<PatientCategory, string> = {
  DESERVING: 'Deserving',
  POOR: 'Poor',
  MEMBER: 'Member',
  GENERAL: 'General',
};
