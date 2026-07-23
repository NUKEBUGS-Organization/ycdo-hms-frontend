import 'dotenv/config';
import {
  Gender,
  MovementReason,
  Prisma,
  PrismaClient,
  TransferStatus,
} from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000001';

/** Deterministic UUID from a seed key (stable across re-runs). */
function id(key: string): string {
  const h = createHash('sha1').update(`ycdo-hms-seed:${key}`).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `8${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join('-');
}

function d(n: number | string): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`${name} must be set in .env before seeding`);
  }
  return v.trim();
}

async function main() {
  const branchId = requireEnv('BRANCH_ID');
  const branchCode = requireEnv('BRANCH_CODE');

  if (branchCode !== 'CH') {
    console.warn(
      `Warning: BRANCH_CODE is "${branchCode}" (seed patients use CH-##### mrNos).`,
    );
  }

  // -------------------------------------------------------------------------
  // 1. Branch
  // -------------------------------------------------------------------------
  const branch = await prisma.branch.upsert({
    where: { id: branchId },
    create: {
      id: branchId,
      code: branchCode,
      name: 'YCDO Central Hospital',
      phone: '051-111-9236',
      address: 'G-8/4, Islamabad',
      active: true,
    },
    update: {
      code: branchCode,
      name: 'YCDO Central Hospital',
      phone: '051-111-9236',
      address: 'G-8/4, Islamabad',
      active: true,
    },
  });

  // -------------------------------------------------------------------------
  // 2. Staff
  // -------------------------------------------------------------------------
  const staffDefs = [
    {
      key: 'staff-dr-ahmed',
      fullName: 'Dr. Ahmed Hassan',
      designation: 'Medical Officer',
      isDoctor: true,
    },
    {
      key: 'staff-dr-fatima',
      fullName: 'Dr. Fatima Khan',
      designation: 'Consultant Physician',
      isDoctor: true,
    },
    {
      key: 'staff-dr-usman',
      fullName: 'Dr. Usman Ali',
      designation: 'Pediatrician',
      isDoctor: true,
    },
    {
      key: 'staff-dr-aisha',
      fullName: 'Dr. Aisha Malik',
      designation: 'Gynecologist',
      isDoctor: true,
    },
    {
      key: 'staff-rec-sana',
      fullName: 'Sana Iqbal',
      designation: 'Receptionist',
      isDoctor: false,
    },
    {
      key: 'staff-pharm-bilal',
      fullName: 'Bilal Raza',
      designation: 'Pharmacist',
      isDoctor: false,
    },
  ] as const;

  const staff: { id: string; fullName: string; isDoctor: boolean }[] = [];
  for (const s of staffDefs) {
    const row = await prisma.staff.upsert({
      where: { id: id(s.key) },
      create: {
        id: id(s.key),
        fullName: s.fullName,
        designation: s.designation,
        isDoctor: s.isDoctor,
        active: true,
      },
      update: {
        fullName: s.fullName,
        designation: s.designation,
        isDoctor: s.isDoctor,
        active: true,
      },
    });
    staff.push(row);
  }

  const pharmacistId = id('staff-pharm-bilal');

  // -------------------------------------------------------------------------
  // 3. Item categories
  // -------------------------------------------------------------------------
  const categoryDefs = [
    { key: 'cat-tablets', name: 'Tablets', tracksStock: true },
    { key: 'cat-syrups', name: 'Syrups', tracksStock: true },
    { key: 'cat-injections', name: 'Injections', tracksStock: true },
    { key: 'cat-lab', name: 'Lab Tests', tracksStock: false },
    { key: 'cat-consult', name: 'Consultation', tracksStock: false },
    { key: 'cat-proc', name: 'Procedures', tracksStock: false },
  ] as const;

  const categories = new Map<string, string>();
  for (const c of categoryDefs) {
    const row = await prisma.itemCategory.upsert({
      where: { id: id(c.key) },
      create: {
        id: id(c.key),
        name: c.name,
        tracksStock: c.tracksStock,
      },
      update: {
        name: c.name,
        tracksStock: c.tracksStock,
      },
    });
    categories.set(c.key, row.id);
  }

  // -------------------------------------------------------------------------
  // 4. Items (~25) — ascending tiers, varied prices
  // -------------------------------------------------------------------------
  type ItemDef = {
    key: string;
    categoryKey: (typeof categoryDefs)[number]['key'];
    name: string;
    barcode?: string;
    purchase: number;
    deserving: number;
    poor: number;
    member: number;
    general: number;
  };

  const itemDefs: ItemDef[] = [
    // Tablets
    {
      key: 'item-panadol',
      categoryKey: 'cat-tablets',
      name: 'Panadol 500mg',
      barcode: '8901030895623',
      purchase: 1.5,
      deserving: 2,
      poor: 3,
      member: 4,
      general: 5,
    },
    {
      key: 'item-brufen',
      categoryKey: 'cat-tablets',
      name: 'Brufen 400mg',
      barcode: '8901030895630',
      purchase: 3.25,
      deserving: 5,
      poor: 7,
      member: 9,
      general: 12,
    },
    {
      key: 'item-augmentin',
      categoryKey: 'cat-tablets',
      name: 'Augmentin 625mg',
      barcode: '8901030895647',
      purchase: 28,
      deserving: 35,
      poor: 42,
      member: 50,
      general: 60,
    },
    {
      key: 'item-amoxil',
      categoryKey: 'cat-tablets',
      name: 'Amoxil 250mg',
      barcode: '8901030895654',
      purchase: 8,
      deserving: 12,
      poor: 15,
      member: 18,
      general: 22,
    },
    {
      key: 'item-flagyl',
      categoryKey: 'cat-tablets',
      name: 'Flagyl 400mg',
      barcode: '8901030895661',
      purchase: 4.5,
      deserving: 6,
      poor: 8,
      member: 10,
      general: 14,
    },
    {
      key: 'item-disprin',
      categoryKey: 'cat-tablets',
      name: 'Disprin',
      barcode: '8901030895678',
      purchase: 0.8,
      deserving: 1.5,
      poor: 2,
      member: 2.5,
      general: 3.5,
    },
    {
      key: 'item-claritin',
      categoryKey: 'cat-tablets',
      name: 'Clarityn 10mg',
      barcode: '8901030895685',
      purchase: 9,
      deserving: 12,
      poor: 16,
      member: 20,
      general: 25,
    },
    {
      key: 'item-risek',
      categoryKey: 'cat-tablets',
      name: 'Risek 20mg',
      barcode: '8901030895692',
      purchase: 11,
      deserving: 15,
      poor: 20,
      member: 25,
      general: 32,
    },
    // Syrups
    {
      key: 'item-ors',
      categoryKey: 'cat-syrups',
      name: 'ORS Sachet',
      barcode: '8901030895708',
      purchase: 5,
      deserving: 8,
      poor: 10,
      member: 12,
      general: 15,
    },
    {
      key: 'item-calpol',
      categoryKey: 'cat-syrups',
      name: 'Calpol Syrup 60ml',
      barcode: '8901030895715',
      purchase: 55,
      deserving: 70,
      poor: 85,
      member: 100,
      general: 120,
    },
    {
      key: 'item-ventolin-syr',
      categoryKey: 'cat-syrups',
      name: 'Ventolin Syrup',
      barcode: '8901030895722',
      purchase: 48,
      deserving: 65,
      poor: 80,
      member: 95,
      general: 110,
    },
    {
      key: 'item-augmentin-syr',
      categoryKey: 'cat-syrups',
      name: 'Augmentin Syrup 156mg',
      barcode: '8901030895739',
      purchase: 180,
      deserving: 220,
      poor: 260,
      member: 300,
      general: 350,
    },
    {
      key: 'item-flagyl-syr',
      categoryKey: 'cat-syrups',
      name: 'Flagyl Suspension',
      barcode: '8901030895746',
      purchase: 42,
      deserving: 55,
      poor: 68,
      member: 80,
      general: 95,
    },
    // Injections
    {
      key: 'item-diclo-inj',
      categoryKey: 'cat-injections',
      name: 'Diclofenac Injection',
      barcode: '8901030895753',
      purchase: 18,
      deserving: 25,
      poor: 35,
      member: 45,
      general: 55,
    },
    {
      key: 'item-ceftriaxone',
      categoryKey: 'cat-injections',
      name: 'Ceftriaxone 1g',
      barcode: '8901030895760',
      purchase: 95,
      deserving: 120,
      poor: 150,
      member: 180,
      general: 220,
    },
    {
      key: 'item-insulin',
      categoryKey: 'cat-injections',
      name: 'Insulin Regular 100IU',
      barcode: '8901030895777',
      purchase: 320,
      deserving: 400,
      poor: 480,
      member: 560,
      general: 650,
    },
    {
      key: 'item-dexa',
      categoryKey: 'cat-injections',
      name: 'Dexamethasone Injection',
      barcode: '8901030895784',
      purchase: 22,
      deserving: 30,
      poor: 40,
      member: 50,
      general: 65,
    },
    // Lab Tests (no stock)
    {
      key: 'item-cbc',
      categoryKey: 'cat-lab',
      name: 'CBC',
      purchase: 80,
      deserving: 150,
      poor: 200,
      member: 250,
      general: 300,
    },
    {
      key: 'item-lft',
      categoryKey: 'cat-lab',
      name: 'LFT',
      purchase: 120,
      deserving: 250,
      poor: 350,
      member: 450,
      general: 550,
    },
    {
      key: 'item-rft',
      categoryKey: 'cat-lab',
      name: 'RFT',
      purchase: 100,
      deserving: 200,
      poor: 280,
      member: 360,
      general: 450,
    },
    {
      key: 'item-blood-sugar',
      categoryKey: 'cat-lab',
      name: 'Blood Sugar (Random)',
      purchase: 20,
      deserving: 50,
      poor: 80,
      member: 100,
      general: 150,
    },
    // Consultation
    {
      key: 'item-opd',
      categoryKey: 'cat-consult',
      name: 'OPD Consultation',
      purchase: 0,
      deserving: 50,
      poor: 100,
      member: 200,
      general: 500,
    },
    {
      key: 'item-followup',
      categoryKey: 'cat-consult',
      name: 'Follow-up Consultation',
      purchase: 0,
      deserving: 0,
      poor: 50,
      member: 100,
      general: 250,
    },
    // Procedures
    {
      key: 'item-ultrasound',
      categoryKey: 'cat-proc',
      name: 'Ultrasound',
      purchase: 200,
      deserving: 400,
      poor: 600,
      member: 800,
      general: 1200,
    },
    {
      key: 'item-ecg',
      categoryKey: 'cat-proc',
      name: 'ECG',
      purchase: 50,
      deserving: 100,
      poor: 150,
      member: 200,
      general: 300,
    },
  ];

  const items: {
    id: string;
    name: string;
    tracksStock: boolean;
    key: string;
  }[] = [];

  for (const it of itemDefs) {
    const categoryId = categories.get(it.categoryKey)!;
    const tracksStock = categoryDefs.find((c) => c.key === it.categoryKey)!
      .tracksStock;

    const row = await prisma.item.upsert({
      where: { id: id(it.key) },
      create: {
        id: id(it.key),
        categoryId,
        name: it.name,
        barcode: it.barcode,
        tracksStock,
        purchasePrice: d(it.purchase),
        priceDeserving: d(it.deserving),
        pricePoor: d(it.poor),
        priceMember: d(it.member),
        priceGeneral: d(it.general),
        active: true,
      },
      update: {
        categoryId,
        name: it.name,
        barcode: it.barcode,
        tracksStock,
        purchasePrice: d(it.purchase),
        priceDeserving: d(it.deserving),
        pricePoor: d(it.poor),
        priceMember: d(it.member),
        priceGeneral: d(it.general),
        active: true,
      },
    });
    items.push({
      id: row.id,
      name: row.name,
      tracksStock: row.tracksStock,
      key: it.key,
    });
  }

  // -------------------------------------------------------------------------
  // 5. BranchStock + OPENING StockMovement for tracksStock items
  // -------------------------------------------------------------------------
  const stockQuantities: Record<string, number> = {
    'item-panadol': 420,
    'item-brufen': 310,
    'item-augmentin': 95,
    'item-amoxil': 180,
    'item-flagyl': 240,
    'item-disprin': 500,
    'item-claritin': 75,
    'item-risek': 130,
    'item-ors': 350,
    'item-calpol': 88,
    'item-ventolin-syr': 64,
    'item-augmentin-syr': 52,
    'item-flagyl-syr': 70,
    'item-diclo-inj': 145,
    'item-ceftriaxone': 60,
    'item-insulin': 55,
    'item-dexa': 110,
  };

  let stockCount = 0;
  let openingMovements = 0;

  for (const item of items.filter((i) => i.tracksStock)) {
    const qty = stockQuantities[item.key] ?? 100;

    await prisma.branchStock.upsert({
      where: {
        branchId_itemId: { branchId, itemId: item.id },
      },
      create: {
        branchId,
        itemId: item.id,
        quantity: d(qty),
        minLimit: 20,
        maxLimit: 1000,
      },
      update: {
        quantity: d(qty),
        minLimit: 20,
        maxLimit: 1000,
      },
    });
    stockCount++;

    const movementId = id(`open-${item.key}`);
    await prisma.stockMovement.upsert({
      where: { id: movementId },
      create: {
        id: movementId,
        branchId,
        itemId: item.id,
        delta: d(qty),
        reason: MovementReason.ADJUSTMENT,
        refType: 'OPENING',
        refId: branchId,
        note: 'Opening balance (seed)',
        createdBy: SYSTEM_ACTOR_ID,
      },
      update: {
        delta: d(qty),
        reason: MovementReason.ADJUSTMENT,
        refType: 'OPENING',
        refId: branchId,
        note: 'Opening balance (seed)',
      },
    });
    openingMovements++;
  }

  // -------------------------------------------------------------------------
  // 6. Patients
  // -------------------------------------------------------------------------
  const patientDefs: {
    key: string;
    mrNo: string;
    name: string;
    gender: Gender;
    ageYears: number;
    phone?: string;
    cnic?: string;
    address?: string;
    guardianName?: string;
    guardianPhone?: string;
  }[] = [
    {
      key: 'pat-01',
      mrNo: 'CH-00001',
      name: 'Muhammad Asif',
      gender: Gender.MALE,
      ageYears: 42,
      phone: '03001234567',
      cnic: '61101-1234567-1',
    },
    {
      key: 'pat-02',
      mrNo: 'CH-00002',
      name: 'Ayesha Bibi',
      gender: Gender.FEMALE,
      ageYears: 28,
      phone: '03019876543',
      cnic: '61101-7654321-2',
    },
    {
      key: 'pat-03',
      mrNo: 'CH-00003',
      name: 'Hassan Raza',
      gender: Gender.MALE,
      ageYears: 7,
      phone: '03331234567',
      guardianName: 'Imran Raza',
      guardianPhone: '03331234567',
    },
    {
      key: 'pat-04',
      mrNo: 'CH-00004',
      name: 'Zainab Fatima',
      gender: Gender.FEMALE,
      ageYears: 55,
      phone: '03215551234',
      cnic: '37405-1122334-5',
    },
    {
      key: 'pat-05',
      mrNo: 'CH-00005',
      name: 'Ali Haider',
      gender: Gender.MALE,
      ageYears: 33,
      cnic: '35202-9988776-3',
    },
    {
      key: 'pat-06',
      mrNo: 'CH-00006',
      name: 'Saima Noreen',
      gender: Gender.FEMALE,
      ageYears: 19,
      phone: '03451112233',
    },
    {
      key: 'pat-07',
      mrNo: 'CH-00007',
      name: 'Omar Farooq',
      gender: Gender.MALE,
      ageYears: 61,
      phone: '03005556677',
      cnic: '61101-5544332-1',
      address: 'Sector G-9, Islamabad',
    },
    {
      key: 'pat-08',
      mrNo: 'CH-00008',
      name: 'Maryam Shah',
      gender: Gender.FEMALE,
      ageYears: 36,
      phone: '03129998877',
    },
    {
      key: 'pat-09',
      mrNo: 'CH-00009',
      name: 'Bilal Ahmed',
      gender: Gender.MALE,
      ageYears: 14,
      guardianName: 'Khalid Ahmed',
      guardianPhone: '03007778899',
    },
    {
      key: 'pat-10',
      mrNo: 'CH-00010',
      name: 'Nida Parveen',
      gender: Gender.FEMALE,
      ageYears: 47,
      phone: '03334445566',
      cnic: '54400-2233445-6',
      address: 'Rawalpindi',
    },
  ];

  let patientCount = 0;
  for (const p of patientDefs) {
    await prisma.patient.upsert({
      where: { id: id(p.key) },
      create: {
        id: id(p.key),
        branchId,
        mrNo: p.mrNo,
        name: p.name,
        gender: p.gender,
        ageYears: p.ageYears,
        phone: p.phone,
        cnic: p.cnic,
        address: p.address,
        guardianName: p.guardianName,
        guardianPhone: p.guardianPhone,
        createdBy: SYSTEM_ACTOR_ID,
      },
      update: {
        mrNo: p.mrNo,
        name: p.name,
        gender: p.gender,
        ageYears: p.ageYears,
        phone: p.phone ?? null,
        cnic: p.cnic ?? null,
        address: p.address ?? null,
        guardianName: p.guardianName ?? null,
        guardianPhone: p.guardianPhone ?? null,
      },
    });
    patientCount++;
  }

  // -------------------------------------------------------------------------
  // 7. Transfers (ISSUED) with lines
  // -------------------------------------------------------------------------
  const transfer1Id = id('xfer-001');
  const transfer2Id = id('xfer-002');
  const issuedAt1 = new Date('2026-07-20T09:00:00+05:00');
  const issuedAt2 = new Date('2026-07-22T14:30:00+05:00');

  await prisma.transfer.upsert({
    where: { id: transfer1Id },
    create: {
      id: transfer1Id,
      branchId,
      transferNo: 'ST-2026-0142',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt1,
      issuedBy: pharmacistId,
    },
    update: {
      transferNo: 'ST-2026-0142',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt1,
      issuedBy: pharmacistId,
      receivedAt: null,
      receivedBy: null,
    },
  });

  const transfer1Lines = [
    { key: 'xfer-001-l1', itemKey: 'item-panadol', qty: 100 },
    { key: 'xfer-001-l2', itemKey: 'item-augmentin', qty: 40 },
    { key: 'xfer-001-l3', itemKey: 'item-ors', qty: 80 },
    { key: 'xfer-001-l4', itemKey: 'item-ceftriaxone', qty: 25 },
  ];

  for (const line of transfer1Lines) {
    await prisma.transferLine.upsert({
      where: { id: id(line.key) },
      create: {
        id: id(line.key),
        transferId: transfer1Id,
        itemId: id(line.itemKey),
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
      },
      update: {
        itemId: id(line.itemKey),
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
        varianceNote: null,
      },
    });
  }

  await prisma.transfer.upsert({
    where: { id: transfer2Id },
    create: {
      id: transfer2Id,
      branchId,
      transferNo: 'ST-2026-0158',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt2,
      issuedBy: pharmacistId,
    },
    update: {
      transferNo: 'ST-2026-0158',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt2,
      issuedBy: pharmacistId,
      receivedAt: null,
      receivedBy: null,
    },
  });

  const transfer2Lines = [
    { key: 'xfer-002-l1', itemKey: 'item-calpol', qty: 30 },
    { key: 'xfer-002-l2', itemKey: 'item-insulin', qty: 15 },
    { key: 'xfer-002-l3', itemKey: 'item-brufen', qty: 60 },
  ];

  for (const line of transfer2Lines) {
    await prisma.transferLine.upsert({
      where: { id: id(line.key) },
      create: {
        id: id(line.key),
        transferId: transfer2Id,
        itemId: id(line.itemKey),
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
      },
      update: {
        itemId: id(line.itemKey),
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
        varianceNote: null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\nYCDO HMS seed complete (idempotent upserts)\n');
  console.log(`  Branch:       ${branch.name} [${branch.code}] ${branch.id}`);
  console.log(
    `  Staff:        ${staff.length} (${staff.filter((s) => s.isDoctor).length} doctors)`,
  );
  console.log(`  Categories:   ${categoryDefs.length}`);
  console.log(
    `  Items:        ${items.length} (${items.filter((i) => i.tracksStock).length} track stock)`,
  );
  console.log(`  BranchStock:  ${stockCount} rows + ${openingMovements} OPENING movements`);
  console.log(`  Patients:     ${patientCount} (mrNo ${branchCode}-00001 …)`);
  console.log(
    `  Transfers:    2 ISSUED (ST-2026-0142: 4 lines, ST-2026-0158: 3 lines)`,
  );
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
