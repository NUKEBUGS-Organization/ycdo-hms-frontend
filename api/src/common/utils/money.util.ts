import { Prisma } from '@prisma/client';

export function sumMoney(...values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce(
    (acc, v) => acc.add(v),
    new Prisma.Decimal(0),
  );
}

export function multiplyMoney(
  a: Prisma.Decimal,
  b: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return a.mul(b);
}

/** Round half-up to 2 decimal places (paisa). */
export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
