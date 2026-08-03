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
  SYSTEM_ACTOR_ID,
} from '../prisma/seed-constants';

const prisma = new PrismaClient();

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

const DOCTOR_ID = STAFF_IDS.DR_AHMED;
const ITEM_STOCK = ITEM_IDS.DISPRIN; // cheap, seeded high
const ITEM_STOCK_B = ITEM_IDS.BRUFEN; // second stock item for refund tests
const ITEM_ZERO = ITEM_IDS.INSULIN; // used as zero-stock bait
const ITEM_PRICE = ITEM_IDS.OPD; // no stock tracking
const ITEM_LAB_A = ITEM_IDS.CBC; // tracksStock=false
const ITEM_LAB_B = ITEM_IDS.LFT; // tracksStock=false

/** Shared between T11 → T12 (idempotent re-apply on the same pharmacy token). */
let t11PharmacyTokenId: string | null = null;
let t11StockAfterRefund: Map<string, string> | null = null;
let t11RefundMovementCount = 0;
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
  const needed = [
    ITEM_STOCK,
    ITEM_STOCK_B,
    ITEM_ZERO,
    ITEM_PRICE,
    ITEM_LAB_A,
    ITEM_LAB_B,
  ];
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
  previousTokenId: string;
  category?: string;
  amountReceived?: number;
  lines: ReturnType<typeof line>[];
}) {
  return {
    cartId: opts.cartId,
    patientId: opts.patientId,
    doctorId: DOCTOR_ID,
    category: opts.category ?? 'GENERAL',
    previousTokenId: opts.previousTokenId,
    amountReceived: opts.amountReceived ?? 99999,
    lines: opts.lines,
  };
}

/** Create a REGISTRATION token to chain pharmacy dispenses from. */
async function createRegistration(
  patientId: string,
  category = 'GENERAL',
): Promise<string> {
  const r = await api('POST', '/tokens/registration', {
    doctorId: DOCTOR_ID,
    category,
    patientId,
  });
  if (!okCreate(r.status)) {
    throw new Error(
      `registration failed for ${patientId}: ${r.status} ${JSON.stringify(r.body)?.slice(0, 160)}`,
    );
  }
  return r.body.id as string;
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

  // Each pharmacy dispense needs a prior registration token
  const regs = await Promise.all(
    patients.map((patientId) => createRegistration(patientId)),
  );

  const responses = await Promise.all(
    patients.map((patientId, i) => {
      const cartId = randomUUID();
      return api(
        'POST',
        '/tokens',
        tokenBody({
          cartId,
          patientId,
          previousTokenId: regs[i],
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
      previousTokenId: await createRegistration(PATIENT_IDS[0]),
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
      previousTokenId: await createRegistration(PATIENT_IDS[1]),
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
      previousTokenId: await createRegistration(PATIENT_IDS[2]),
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
    const previousTokenId = await createRegistration(PATIENT_IDS[i], category);
    const save = await api(
      'POST',
      '/tokens',
      tokenBody({
        cartId: randomUUID(),
        patientId: PATIENT_IDS[i],
        previousTokenId,
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

async function test8_previousTokenWrongPatient(): Promise<Result> {
  const name = 'T8 previousTokenId must belong to same patient';

  const patientA = PATIENT_IDS[0];
  const patientB = PATIENT_IDS[1];
  const regForA = await createRegistration(patientA);

  const save = await api(
    'POST',
    '/tokens',
    tokenBody({
      cartId: randomUUID(),
      patientId: patientB,
      previousTokenId: regForA,
      lines: [line(ITEM_PRICE, 1)],
    }),
  );

  const pass = save.status === 400;
  return {
    name,
    pass,
    detail: pass
      ? '400 when previousTokenId belongs to a different patient'
      : `expected 400, got ${save.status}: ${JSON.stringify(save.body)?.slice(0, 160)}`,
  };
}

async function test9_labTokenNoStockAndReceivable(
  branchId: string,
): Promise<Result> {
  const name = 'T9 Lab token prices, no stock moves, receivable';

  const patientId = PATIENT_IDS[2];
  const previousTokenId = await createRegistration(patientId, 'GENERAL');

  const prices = await prisma.branchItemPrice.findMany({
    where: { branchId, itemId: { in: [ITEM_LAB_A, ITEM_LAB_B] } },
  });
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  const priceA = byId.get(ITEM_LAB_A);
  const priceB = byId.get(ITEM_LAB_B);
  if (!priceA || !priceB) {
    return {
      name,
      pass: false,
      detail: 'BranchItemPrice missing for CBC/LFT — reseed',
    };
  }

  const expectedTotal = priceA.priceGeneral.add(priceB.priceGeneral);
  const amountReceived = new Prisma.Decimal(1); // underpay → receivable

  const save = await api('POST', '/tokens/lab', {
    patientId,
    doctorId: DOCTOR_ID,
    category: 'GENERAL',
    previousTokenId,
    amountReceived: Number(amountReceived.toString()),
    lines: [
      { itemId: ITEM_LAB_A, quantity: 1 },
      { itemId: ITEM_LAB_B, quantity: 1 },
    ],
    receivable: { guardianName: 'Lab Guardian' },
  });

  if (!okCreate(save.status)) {
    return {
      name,
      pass: false,
      detail: `lab save failed: ${save.status} ${JSON.stringify(save.body)?.slice(0, 160)}`,
    };
  }

  if (save.body?.tokenType !== 'LAB') {
    return {
      name,
      pass: false,
      detail: `expected tokenType LAB, got ${save.body?.tokenType}`,
    };
  }

  const total = new Prisma.Decimal(save.body.totalAmount);
  if (!total.eq(expectedTotal)) {
    return {
      name,
      pass: false,
      detail: `totalAmount ${total} !== BranchItemPrice sum ${expectedTotal}`,
    };
  }

  const movements = await prisma.stockMovement.findMany({
    where: { refType: 'TOKEN', refId: save.body.id },
  });
  if (movements.length !== 0) {
    return {
      name,
      pass: false,
      detail: `expected 0 StockMovements, got ${movements.length}`,
    };
  }

  const receivable = await prisma.receivable.findUnique({
    where: { tokenId: save.body.id },
  });
  if (!receivable || receivable.status !== 'OPEN') {
    return {
      name,
      pass: false,
      detail: `expected OPEN receivable, got ${receivable?.status ?? 'none'}`,
    };
  }

  const due = new Prisma.Decimal(receivable.amountDue);
  const expectedDue = expectedTotal.sub(amountReceived);
  if (!due.eq(expectedDue)) {
    return {
      name,
      pass: false,
      detail: `amountDue ${due} !== ${expectedDue}`,
    };
  }

  return {
    name,
    pass: true,
    detail: `LAB total=${total}, 0 movements, receivable due=${due}`,
  };
}

async function test10_labRejectsStockItem(): Promise<Result> {
  const name = 'T10 Lab token rejects stock-tracked item';

  const patientId = PATIENT_IDS[3];
  const previousTokenId = await createRegistration(patientId);

  const save = await api('POST', '/tokens/lab', {
    patientId,
    doctorId: DOCTOR_ID,
    category: 'GENERAL',
    previousTokenId,
    amountReceived: 99999,
    lines: [
      { itemId: ITEM_LAB_A, quantity: 1 },
      { itemId: ITEM_STOCK, quantity: 1 },
    ],
  });

  const pass = save.status === 400;
  return {
    name,
    pass,
    detail: pass
      ? '400 when lab lines include a stock-tracked item'
      : `expected 400, got ${save.status}: ${JSON.stringify(save.body)?.slice(0, 160)}`,
  };
}

async function stockQty(
  branchId: string,
  itemId: string,
): Promise<Prisma.Decimal> {
  const row = await prisma.branchStock.findUnique({
    where: { branchId_itemId: { branchId, itemId } },
  });
  return row?.quantity ?? new Prisma.Decimal(0);
}

async function test11_refundFlagRestocks(branchId: string): Promise<Result> {
  const name = 'T11 Refund flag restocks pharmacy lines';

  await releaseActive(ITEM_STOCK);
  await releaseActive(ITEM_STOCK_B);
  await setStock(branchId, ITEM_STOCK, 100);
  await setStock(branchId, ITEM_STOCK_B, 80);

  const preA = await stockQty(branchId, ITEM_STOCK);
  const preB = await stockQty(branchId, ITEM_STOCK_B);

  const patientId = PATIENT_IDS[4];
  const previousTokenId = await createRegistration(patientId);
  const save = await api(
    'POST',
    '/tokens',
    tokenBody({
      cartId: randomUUID(),
      patientId,
      previousTokenId,
      lines: [line(ITEM_STOCK, 2), line(ITEM_STOCK_B, 3)],
    }),
  );

  if (!okCreate(save.status)) {
    return {
      name,
      pass: false,
      detail: `pharmacy save failed: ${save.status} ${JSON.stringify(save.body)?.slice(0, 120)}`,
    };
  }

  const tokenId = save.body.id as string;
  const afterDispenseA = await stockQty(branchId, ITEM_STOCK);
  const afterDispenseB = await stockQty(branchId, ITEM_STOCK_B);
  if (!afterDispenseA.eq(preA.sub(2)) || !afterDispenseB.eq(preB.sub(3))) {
    return {
      name,
      pass: false,
      detail: `dispense stock unexpected: A ${afterDispenseA} B ${afterDispenseB}`,
    };
  }

  const flagged = await api('POST', `/tokens/${tokenId}/apply-refund-flag`, {
    flaggedBy: SYSTEM_ACTOR_ID,
    reason: 'T11 concurrency refund',
  });

  if (!okCreate(flagged.status)) {
    return {
      name,
      pass: false,
      detail: `apply-refund-flag failed: ${flagged.status} ${JSON.stringify(flagged.body)?.slice(0, 160)}`,
    };
  }

  if (flagged.body?.status !== 'REFUNDED' || flagged.body?.refundFlagged !== true) {
    return {
      name,
      pass: false,
      detail: `expected REFUNDED+flagged, got status=${flagged.body?.status} flagged=${flagged.body?.refundFlagged}`,
    };
  }

  const postA = await stockQty(branchId, ITEM_STOCK);
  const postB = await stockQty(branchId, ITEM_STOCK_B);
  if (!postA.eq(preA) || !postB.eq(preB)) {
    return {
      name,
      pass: false,
      detail: `stock not restored: A ${postA} (want ${preA}), B ${postB} (want ${preB})`,
    };
  }

  const refundMoves = await prisma.stockMovement.findMany({
    where: {
      refType: 'REFUND',
      refId: tokenId,
      reason: 'SALE_RETURN',
    },
  });
  if (refundMoves.length !== 2) {
    return {
      name,
      pass: false,
      detail: `expected 2 SALE_RETURN/REFUND movements, got ${refundMoves.length}`,
    };
  }

  t11PharmacyTokenId = tokenId;
  t11StockAfterRefund = new Map([
    [ITEM_STOCK, postA.toString()],
    [ITEM_STOCK_B, postB.toString()],
  ]);
  t11RefundMovementCount = refundMoves.length;

  return {
    name,
    pass: true,
    detail: `REFUNDED, stock restored ${preA}/${preB}, ${refundMoves.length} SALE_RETURN rows`,
  };
}

async function test12_refundFlagIdempotent(branchId: string): Promise<Result> {
  const name = 'T12 Refund flag is idempotent (no double restock)';

  if (!t11PharmacyTokenId || !t11StockAfterRefund) {
    return {
      name,
      pass: false,
      detail: 'T11 did not leave a pharmacy token to re-flag',
    };
  }

  const tokenId = t11PharmacyTokenId;
  const beforeA = t11StockAfterRefund.get(ITEM_STOCK)!;
  const beforeB = t11StockAfterRefund.get(ITEM_STOCK_B)!;
  const movesBefore = t11RefundMovementCount;

  const again = await api('POST', `/tokens/${tokenId}/apply-refund-flag`, {
    flaggedBy: SYSTEM_ACTOR_ID,
    reason: 'T12 second apply — must be no-op',
  });

  if (!okCreate(again.status)) {
    return {
      name,
      pass: false,
      detail: `second apply errored: ${again.status} ${JSON.stringify(again.body)?.slice(0, 160)}`,
    };
  }

  if (again.body?.status !== 'REFUNDED') {
    return {
      name,
      pass: false,
      detail: `expected still REFUNDED, got ${again.body?.status}`,
    };
  }

  const postA = await stockQty(branchId, ITEM_STOCK);
  const postB = await stockQty(branchId, ITEM_STOCK_B);
  if (!postA.eq(beforeA) || !postB.eq(beforeB)) {
    return {
      name,
      pass: false,
      detail: `stock changed on re-apply: A ${postA} vs ${beforeA}, B ${postB} vs ${beforeB}`,
    };
  }

  const movesAfter = await prisma.stockMovement.count({
    where: { refType: 'REFUND', refId: tokenId, reason: 'SALE_RETURN' },
  });
  if (movesAfter !== movesBefore) {
    return {
      name,
      pass: false,
      detail: `extra movements on re-apply: ${movesAfter} vs ${movesBefore}`,
    };
  }

  return {
    name,
    pass: true,
    detail: 'second apply no-op — stock and movement count unchanged',
  };
}

async function test13_refundFlagLabNoStock(): Promise<Result> {
  const name = 'T13 Refund flag on LAB token (no stock moves)';

  const patientId = PATIENT_IDS[5];
  const previousTokenId = await createRegistration(patientId);
  const save = await api('POST', '/tokens/lab', {
    patientId,
    doctorId: DOCTOR_ID,
    category: 'GENERAL',
    previousTokenId,
    amountReceived: 99999,
    lines: [{ itemId: ITEM_LAB_A, quantity: 1 }],
  });

  if (!okCreate(save.status)) {
    return {
      name,
      pass: false,
      detail: `lab save failed: ${save.status} ${JSON.stringify(save.body)?.slice(0, 120)}`,
    };
  }

  const tokenId = save.body.id as string;
  const flagged = await api('POST', `/tokens/${tokenId}/apply-refund-flag`, {
    flaggedBy: SYSTEM_ACTOR_ID,
    reason: 'T13 lab refund',
  });

  if (!okCreate(flagged.status)) {
    return {
      name,
      pass: false,
      detail: `apply failed: ${flagged.status} ${JSON.stringify(flagged.body)?.slice(0, 160)}`,
    };
  }

  if (flagged.body?.status !== 'REFUNDED') {
    return {
      name,
      pass: false,
      detail: `expected REFUNDED, got ${flagged.body?.status}`,
    };
  }

  const moves = await prisma.stockMovement.count({
    where: { refType: 'REFUND', refId: tokenId },
  });
  if (moves !== 0) {
    return {
      name,
      pass: false,
      detail: `expected 0 REFUND movements for lab, got ${moves}`,
    };
  }

  return {
    name,
    pass: true,
    detail: 'LAB → REFUNDED with zero stock movements',
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
    results.push(await test8_previousTokenWrongPatient());
    results.push(await test9_labTokenNoStockAndReceivable(branchId));
    results.push(await test10_labRejectsStockItem());
    results.push(await test11_refundFlagRestocks(branchId));
    results.push(await test12_refundFlagIdempotent(branchId));
    results.push(await test13_refundFlagLabNoStock());
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
