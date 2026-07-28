/**
 * Concurrency / invariant checks against a running API.
 * Not Jest — prints PASS/FAIL and exits non-zero on failure.
 *
 *   npm run test:concurrency
 *   BASE_URL=http://localhost:3000/api npm run test:concurrency
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  ITEM_IDS,
  PATIENT_IDS as SEED_PATIENT_IDS,
  SEED_BRANCH_ID,
  STAFF_IDS,
} from '../prisma/seed-constants';

const prisma = new PrismaClient();

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

const DOCTOR_ID = STAFF_IDS.DR_AHMED;
const ITEM_STOCK = ITEM_IDS.DISPRIN; // cheap, seeded high
const ITEM_ZERO = ITEM_IDS.INSULIN; // used as zero-stock bait
const ITEM_PRICE = ITEM_IDS.OPD; // no stock tracking
const PATIENT_IDS = [
  SEED_PATIENT_IDS.PAT_01,
  SEED_PATIENT_IDS.PAT_02,
  SEED_PATIENT_IDS.PAT_03,
  SEED_PATIENT_IDS.PAT_04,
  SEED_PATIENT_IDS.PAT_05,
  SEED_PATIENT_IDS.PAT_06,
  SEED_PATIENT_IDS.PAT_07,
  SEED_PATIENT_IDS.PAT_08,
  SEED_PATIENT_IDS.PAT_09,
  SEED_PATIENT_IDS.PAT_10,
];

/** Deterministic UUIDs for concurrency-only patients (not seed catalogue). */
function concurrencyPatientId(n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `b0000001-0000-4000-8000-${hex}`;
}

type Result = { name: string; pass: boolean; detail: string };

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

function okCreate(status: number): boolean {
  return status === 200 || status === 201;
}

async function setStock(branchId: string, itemId: string, qty: number) {
  await prisma.branchStock.upsert({
    where: { branchId_itemId: { branchId, itemId } },
    create: {
      branchId,
      itemId,
      quantity: new Prisma.Decimal(qty),
      minLimit: 20,
      maxLimit: 1000,
    },
    update: { quantity: new Prisma.Decimal(qty) },
  });
}

/** Ensure BranchItemPrice exists for items this suite touches (seed normally provides these). */
async function ensureBranchPrices(branchId: string) {
  const needed = [ITEM_STOCK, ITEM_ZERO, ITEM_PRICE];
  for (const itemId of needed) {
    const existing = await prisma.branchItemPrice.findUnique({
      where: { branchId_itemId: { branchId, itemId } },
    });
    if (existing) continue;

    // Fallback tiers if seed was skipped — ascending DESERVING…GENERAL
    await prisma.branchItemPrice.create({
      data: {
        branchId,
        itemId,
        purchasePrice: new Prisma.Decimal(10),
        priceDeserving: new Prisma.Decimal(50),
        pricePoor: new Prisma.Decimal(100),
        priceMember: new Prisma.Decimal(200),
        priceGeneral: new Prisma.Decimal(500),
      },
    });
  }
}

async function releaseActive(itemId: string) {
  await prisma.stockReservation.updateMany({
    where: { itemId, status: 'ACTIVE' },
    data: { status: 'RELEASED' },
  });
}

function line(itemId: string, qty: number) {
  return { itemId, dose: 0, feed: 0, days: 0, fixDose: qty };
}

function tokenBody(opts: {
  cartId: string;
  patientId: string;
  category?: string;
  amountReceived?: number;
  lines: ReturnType<typeof line>[];
}) {
  return {
    cartId: opts.cartId,
    patientId: opts.patientId,
    doctorId: DOCTOR_ID,
    category: opts.category ?? 'GENERAL',
    amountReceived: opts.amountReceived ?? 99999,
    lines: opts.lines,
  };
}

async function ensurePatients(
  branchId: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = concurrencyPatientId(i + 1);
    const mrNo = `CH-C${String(i + 1).padStart(4, '0')}`;
    await prisma.patient.upsert({
      where: { id },
      create: {
        id,
        branchId,
        mrNo,
        name: `Concurrency Patient ${i + 1}`,
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
        ageYears: 20 + (i % 40),
        createdBy: '00000000-0000-4000-8000-000000000001',
      },
      update: {
        name: `Concurrency Patient ${i + 1}`,
      },
    });
    ids.push(id);
  }
  return ids;
}

async function test1_tokenNumbers(branchId: string): Promise<Result> {
  const name = 'T1 Token number uniqueness (20 concurrent)';
  await releaseActive(ITEM_STOCK);
  await setStock(branchId, ITEM_STOCK, 500);

  const patients = await ensurePatients(branchId, 20);

  const responses = await Promise.all(
    patients.map((patientId) => {
      const cartId = randomUUID();
      return api(
        'POST',
        '/tokens',
        tokenBody({
          cartId,
          patientId,
          lines: [line(ITEM_STOCK, 1)],
        }),
      );
    }),
  );

  const successes = responses.filter((r) => okCreate(r.status));
  if (successes.length !== 20) {
    const fails = responses
      .filter((r) => !okCreate(r.status))
      .map((r) => `${r.status}: ${JSON.stringify(r.body)?.slice(0, 120)}`)
      .slice(0, 3);
    return {
      name,
      pass: false,
      detail: `expected 20 successes, got ${successes.length}. Samples: ${fails.join(' | ')}`,
    };
  }

  const nos = successes.map((r) => r.body.tokenNo as number).sort((a, b) => a - b);
  const unique = new Set(nos);
  if (unique.size !== 20) {
    return {
      name,
      pass: false,
      detail: `duplicate tokenNo values: [${nos.join(', ')}]`,
    };
  }
  const contiguous = nos[19] - nos[0] === 19;
  if (!contiguous) {
    return {
      name,
      pass: false,
      detail: `not contiguous: [${nos.join(', ')}]`,
    };
  }

  return {
    name,
    pass: true,
    detail: `tokenNo ${nos[0]}…${nos[19]} (20 distinct contiguous)`,
  };
}

async function test2_reservationOversell(branchId: string): Promise<Result> {
  const name = 'T2 Reservation prevents overselling (10×1 on qty 5)';
  await releaseActive(ITEM_STOCK);
  await setStock(branchId, ITEM_STOCK, 5);

  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      api('POST', '/reservations', {
        cartId: randomUUID(),
        itemId: ITEM_STOCK,
        quantity: 1,
      }),
    ),
  );

  const created = responses.filter((r) => r.status === 201).length;
  const conflicted = responses.filter((r) => r.status === 409).length;
  const pass = created === 5 && conflicted === 5;

  return {
    name,
    pass,
    detail: pass
      ? '5×201 + 5×409'
      : `got ${created}×201, ${conflicted}×409 (other: ${10 - created - conflicted})`,
  };
}

async function test3_holdBlocksOtherCart(branchId: string): Promise<Result> {
  const name = 'T3 Other cart blocked by active holds';
  await releaseActive(ITEM_STOCK);
  await setStock(branchId, ITEM_STOCK, 3);

  const cartA = randomUUID();
  const cartB = randomUUID();

  for (let i = 0; i < 3; i++) {
    const r = await api('POST', '/reservations', {
      cartId: cartA,
      itemId: ITEM_STOCK,
      quantity: 1,
    });
    if (r.status !== 201) {
      return {
        name,
        pass: false,
        detail: `cart A reservation ${i + 1} failed: ${r.status}`,
      };
    }
  }

  const save = await api(
    'POST',
    '/tokens',
    tokenBody({
      cartId: cartB,
      patientId: PATIENT_IDS[0],
      lines: [line(ITEM_STOCK, 1)],
    }),
  );

  const pass = save.status === 409;
  return {
    name,
    pass,
    detail: pass
      ? 'cart B save correctly 409'
      : `expected 409, got ${save.status}: ${JSON.stringify(save.body)?.slice(0, 160)}`,
  };
}

async function test4_ownCartNotBlocked(branchId: string): Promise<Result> {
  const name = 'T4 Cart not blocked by its own reservations';
  await releaseActive(ITEM_STOCK);
  await setStock(branchId, ITEM_STOCK, 3);

  const cartA = randomUUID();
  for (let i = 0; i < 3; i++) {
    const r = await api('POST', '/reservations', {
      cartId: cartA,
      itemId: ITEM_STOCK,
      quantity: 1,
    });
    if (r.status !== 201) {
      return {
        name,
        pass: false,
        detail: `reservation ${i + 1} failed: ${r.status}`,
      };
    }
  }

  const save = await api(
    'POST',
    '/tokens',
    tokenBody({
      cartId: cartA,
      patientId: PATIENT_IDS[1],
      lines: [line(ITEM_STOCK, 3)],
    }),
  );

  const pass = okCreate(save.status);
  return {
    name,
    pass,
    detail: pass
      ? `save ${save.status}, tokenNo ${save.body?.tokenNo}`
      : `expected 2xx, got ${save.status}: ${JSON.stringify(save.body)?.slice(0, 160)}`,
  };
}

async function test5_rollbackKeepsReservations(
  branchId: string,
): Promise<Result> {
  const name = 'T5 Failed save leaves reservations ACTIVE';
  await releaseActive(ITEM_STOCK);
  await releaseActive(ITEM_ZERO);
  await setStock(branchId, ITEM_STOCK, 50);
  await setStock(branchId, ITEM_ZERO, 0);

  const cartC = randomUUID();
  for (let i = 0; i < 2; i++) {
    const r = await api('POST', '/reservations', {
      cartId: cartC,
      itemId: ITEM_STOCK,
      quantity: 1,
    });
    if (r.status !== 201) {
      return {
        name,
        pass: false,
        detail: `reservation ${i + 1} failed: ${r.status}`,
      };
    }
  }

  const save = await api(
    'POST',
    '/tokens',
    tokenBody({
      cartId: cartC,
      patientId: PATIENT_IDS[2],
      lines: [line(ITEM_STOCK, 2), line(ITEM_ZERO, 1)],
    }),
  );

  if (save.status !== 409) {
    return {
      name,
      pass: false,
      detail: `expected save 409, got ${save.status}`,
    };
  }

  const holds = await prisma.stockReservation.findMany({
    where: { cartId: cartC },
  });
  const allActive =
    holds.length === 2 && holds.every((h) => h.status === 'ACTIVE');

  return {
    name,
    pass: allActive,
    detail: allActive
      ? '409 + 2 reservations still ACTIVE'
      : `holds: ${holds.map((h) => h.status).join(', ') || 'none'}`,
  };
}

async function test6_pricingTiers(): Promise<Result> {
  const name = 'T6 Pricing tiers ascending (DESERVING…GENERAL)';
  const categories = ['DESERVING', 'POOR', 'MEMBER', 'GENERAL'] as const;

  const branchPrice = await prisma.branchItemPrice.findUnique({
    where: {
      branchId_itemId: { branchId: SEED_BRANCH_ID, itemId: ITEM_PRICE },
    },
  });
  if (!branchPrice) {
    return {
      name,
      pass: false,
      detail: `BranchItemPrice missing for OPD at ${SEED_BRANCH_ID}`,
    };
  }

  const expectedByCategory: Record<(typeof categories)[number], Prisma.Decimal> =
    {
      DESERVING: branchPrice.priceDeserving,
      POOR: branchPrice.pricePoor,
      MEMBER: branchPrice.priceMember,
      GENERAL: branchPrice.priceGeneral,
    };

  const prices: { category: string; unitPrice: Prisma.Decimal }[] = [];

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const save = await api(
      'POST',
      '/tokens',
      tokenBody({
        cartId: randomUUID(),
        patientId: PATIENT_IDS[i],
        category,
        amountReceived: 99999,
        lines: [line(ITEM_PRICE, 1)],
      }),
    );
    if (!okCreate(save.status)) {
      return {
        name,
        pass: false,
        detail: `${category} save failed: ${save.status} ${JSON.stringify(save.body)?.slice(0, 120)}`,
      };
    }
    const unitPrice = save.body?.lines?.[0]?.unitPrice;
    if (unitPrice == null) {
      return {
        name,
        pass: false,
        detail: `${category}: missing lines[0].unitPrice`,
      };
    }
    const snapped = new Prisma.Decimal(unitPrice);
    if (!snapped.eq(expectedByCategory[category])) {
      return {
        name,
        pass: false,
        detail: `${category}: token line ${snapped} !== BranchItemPrice ${expectedByCategory[category]}`,
      };
    }
    prices.push({ category, unitPrice: snapped });
  }

  const distinct = new Set(prices.map((p) => p.unitPrice.toString()));
  if (distinct.size !== 4) {
    return {
      name,
      pass: false,
      detail: `expected 4 distinct prices, got ${[...distinct].join(', ')}`,
    };
  }

  const ordered =
    prices[0].unitPrice.lt(prices[1].unitPrice) &&
    prices[1].unitPrice.lt(prices[2].unitPrice) &&
    prices[2].unitPrice.lt(prices[3].unitPrice);

  return {
    name,
    pass: ordered,
    detail: ordered
      ? `BranchItemPrice → ${prices.map((p) => `${p.category}=${p.unitPrice}`).join(' < ')}`
      : `not ascending: ${prices.map((p) => `${p.category}=${p.unitPrice}`).join(', ')}`,
  };
}

async function test7_registrationSharesCounter(
  branchId: string,
): Promise<Result> {
  const name = 'T7 Registration shares token counter (10 concurrent)';

  // Same PKT calendar-day truncation as api/src/common/utils/date.util.ts
  const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
  const pkt = new Date(Date.now() + PKT_OFFSET_MS);
  const day = new Date(
    Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) -
      PKT_OFFSET_MS,
  );

  const maxBefore = await prisma.token.aggregate({
    where: { branchId, tokenDate: day },
    _max: { tokenNo: true },
  });
  const lastNoBefore = maxBefore._max.tokenNo ?? 0;

  const responses = await Promise.all(
    PATIENT_IDS.map((patientId) =>
      api('POST', '/tokens/registration', {
        doctorId: DOCTOR_ID,
        category: 'GENERAL',
        patientId,
      }),
    ),
  );

  const failed = responses.filter((r) => !okCreate(r.status));
  if (failed.length > 0) {
    return {
      name,
      pass: false,
      detail: `${failed.length}/10 failed e.g. ${failed[0].status} ${JSON.stringify(failed[0].body)?.slice(0, 120)}`,
    };
  }

  const nos = responses
    .map((r) => r.body?.tokenNo as number)
    .filter((n) => typeof n === 'number')
    .sort((a, b) => a - b);

  if (nos.length !== 10) {
    return {
      name,
      pass: false,
      detail: `expected 10 tokenNos, got ${nos.length}`,
    };
  }

  const distinct = new Set(nos);
  if (distinct.size !== 10) {
    return {
      name,
      pass: false,
      detail: `duplicate tokenNos: ${nos.join(', ')}`,
    };
  }

  const expected = Array.from({ length: 10 }, (_, i) => lastNoBefore + 1 + i);
  const contiguous = nos.every((n, i) => n === expected[i]);
  const typesOk = responses.every(
    (r) => r.body?.tokenType === 'REGISTRATION' && Array.isArray(r.body?.lines) && r.body.lines.length === 0,
  );

  return {
    name,
    pass: contiguous && typesOk,
    detail: contiguous && typesOk
      ? `after pharmacy lastNo=${lastNoBefore} → registration ${nos[0]}…${nos[9]} (shared sequence)`
      : `expected ${expected[0]}…${expected[9]}, got ${nos.join(', ')}; typesOk=${typesOk}`,
  };
}

async function main() {
  const branchId = process.env.BRANCH_ID?.trim() || SEED_BRANCH_ID;
  if (branchId !== SEED_BRANCH_ID) {
    console.error(
      `BRANCH_ID must be ${SEED_BRANCH_ID} (seed constants). Got: ${branchId}`,
    );
    process.exit(1);
  }

  // Sanity: API up + seed data present
  try {
    const health = await fetch(BASE_URL.replace(/\/api$/, '') + '/api');
    void health;
  } catch {
    // continue — specific calls will fail with clearer errors
  }

  const doctor = await prisma.staff.findUnique({ where: { id: DOCTOR_ID } });
  const item = await prisma.item.findUnique({ where: { id: ITEM_STOCK } });
  if (!doctor || !item) {
    console.error('Seed data missing — run: npx prisma db seed');
    process.exit(1);
  }

  await ensureBranchPrices(branchId);

  console.log(`\nConcurrency tests → ${BASE_URL}\n`);

  const results: Result[] = [];

  try {
    results.push(await test1_tokenNumbers(branchId));
    results.push(await test2_reservationOversell(branchId));
    results.push(await test3_holdBlocksOtherCart(branchId));
    results.push(await test4_ownCartNotBlocked(branchId));
    results.push(await test5_rollbackKeepsReservations(branchId));
    results.push(await test6_pricingTiers());
    results.push(await test7_registrationSharesCounter(branchId));
  } catch (e) {
    console.error('Unhandled error:', e);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Summary table
  const nameWidth = Math.max(...results.map((r) => r.name.length), 10);
  console.log('─'.repeat(nameWidth + 12));
  console.log(
    `${'TEST'.padEnd(nameWidth)}  ${'RESULT'.padEnd(6)}  DETAIL`,
  );
  console.log('─'.repeat(nameWidth + 12));
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    console.log(`${r.name.padEnd(nameWidth)}  ${mark.padEnd(6)}  ${r.detail}`);
  }
  console.log('─'.repeat(nameWidth + 12));

  const failed = results.filter((r) => !r.pass).length;
  console.log(
    failed === 0
      ? `\nAll ${results.length} tests passed.\n`
      : `\n${failed}/${results.length} failed.\n`,
  );

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main();
