import {
  CATEGORY_IDS,
  ITEM_IDS,
  PATIENT_IDS,
  REGISTRATION_FEES,
  SEED_BRANCH_CODE,
  SEED_BRANCH_ID,
  STAFF_IDS,
  SYSTEM_ACTOR_ID,
  TRANSFER_IDS,
  TRANSFER_LINE_IDS,
  openingMovementId,
} from './seed-constants';
import {
  Gender,
  MovementReason,
  PatientCategory,
  Prisma,
  PrismaClient,
  TransferStatus,
} from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

function d(n: number | string): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`${name} must be set before seeding`);
  }
  return v.trim();
}

async function main() {
  const branchId = requireEnv('BRANCH_ID');
  const branchCode = requireEnv('BRANCH_CODE');

  if (branchId !== SEED_BRANCH_ID) {
    throw new Error(
      `BRANCH_ID must be ${SEED_BRANCH_ID} (SEED_BRANCH_ID) to match seed data. Got: ${branchId}`,
    );
  }
  if (branchCode !== SEED_BRANCH_CODE) {
    throw new Error(
      `BRANCH_CODE must be ${SEED_BRANCH_CODE}. Got: ${branchCode}`,
    );
  }

  // -------------------------------------------------------------------------
  // 1. Branch
  // -------------------------------------------------------------------------
  const branch = await prisma.branch.upsert({
    where: { id: SEED_BRANCH_ID },
    create: {
      id: SEED_BRANCH_ID,
      code: SEED_BRANCH_CODE,
      name: 'YCDO Central Hospital',
      phone: '051-111-9236',
      address: 'G-8/4, Islamabad',
      active: true,
    },
    update: {
      code: SEED_BRANCH_CODE,
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
      id: STAFF_IDS.DR_AHMED,
      fullName: 'Dr. Ahmed Hassan',
      designation: 'Medical Officer',
      isDoctor: true,
    },
    {
      id: STAFF_IDS.DR_FATIMA,
      fullName: 'Dr. Fatima Khan',
      designation: 'Consultant Physician',
      isDoctor: true,
    },
    {
      id: STAFF_IDS.DR_USMAN,
      fullName: 'Dr. Usman Ali',
      designation: 'Pediatrician',
      isDoctor: true,
    },
    {
      id: STAFF_IDS.DR_AISHA,
      fullName: 'Dr. Aisha Malik',
      designation: 'Gynecologist',
      isDoctor: true,
    },
    {
      id: STAFF_IDS.REC_SANA,
      fullName: 'Sana Iqbal',
      designation: 'Receptionist',
      isDoctor: false,
    },
    {
      id: STAFF_IDS.PHARM_BILAL,
      fullName: 'Bilal Raza',
      designation: 'Pharmacist',
      isDoctor: false,
    },
  ] as const;

  const staff: { id: string; fullName: string; isDoctor: boolean }[] = [];
  for (const s of staffDefs) {
    const row = await prisma.staff.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
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

  // -------------------------------------------------------------------------
  // 3. Item categories
  // -------------------------------------------------------------------------
  const categoryDefs = [
    { id: CATEGORY_IDS.TABLETS, name: 'Tablets', tracksStock: true },
    { id: CATEGORY_IDS.SYRUPS, name: 'Syrups', tracksStock: true },
    { id: CATEGORY_IDS.INJECTIONS, name: 'Injections', tracksStock: true },
    { id: CATEGORY_IDS.LAB, name: 'Lab Tests', tracksStock: false },
    { id: CATEGORY_IDS.CONSULT, name: 'Consultation', tracksStock: false },
    { id: CATEGORY_IDS.PROC, name: 'Procedures', tracksStock: false },
  ] as const;

  for (const c of categoryDefs) {
    await prisma.itemCategory.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        tracksStock: c.tracksStock,
      },
      update: {
        name: c.name,
        tracksStock: c.tracksStock,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 4. Items
  // -------------------------------------------------------------------------
  type ItemDef = {
    id: string;
    categoryId: string;
    name: string;
    barcode?: string;
    tracksStock: boolean;
    purchase: number;
    deserving: number;
    poor: number;
    member: number;
    general: number;
  };

  const itemDefs: ItemDef[] = [
    {
      id: ITEM_IDS.PANADOL,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Panadol 500mg',
      barcode: '8901030895623',
      tracksStock: true,
      purchase: 1.5,
      deserving: 2,
      poor: 3,
      member: 4,
      general: 5,
    },
    {
      id: ITEM_IDS.BRUFEN,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Brufen 400mg',
      barcode: '8901030895630',
      tracksStock: true,
      purchase: 3.25,
      deserving: 5,
      poor: 7,
      member: 9,
      general: 12,
    },
    {
      id: ITEM_IDS.AUGMENTIN,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Augmentin 625mg',
      barcode: '8901030895647',
      tracksStock: true,
      purchase: 28,
      deserving: 35,
      poor: 42,
      member: 50,
      general: 60,
    },
    {
      id: ITEM_IDS.AMOXIL,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Amoxil 250mg',
      barcode: '8901030895654',
      tracksStock: true,
      purchase: 8,
      deserving: 12,
      poor: 15,
      member: 18,
      general: 22,
    },
    {
      id: ITEM_IDS.FLAGYL,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Flagyl 400mg',
      barcode: '8901030895661',
      tracksStock: true,
      purchase: 4.5,
      deserving: 6,
      poor: 8,
      member: 10,
      general: 14,
    },
    {
      id: ITEM_IDS.DISPRIN,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Disprin',
      barcode: '8901030895678',
      tracksStock: true,
      purchase: 0.8,
      deserving: 1.5,
      poor: 2,
      member: 2.5,
      general: 3.5,
    },
    {
      id: ITEM_IDS.CLARITIN,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Clarityn 10mg',
      barcode: '8901030895685',
      tracksStock: true,
      purchase: 9,
      deserving: 12,
      poor: 16,
      member: 20,
      general: 25,
    },
    {
      id: ITEM_IDS.RISEK,
      categoryId: CATEGORY_IDS.TABLETS,
      name: 'Risek 20mg',
      barcode: '8901030895692',
      tracksStock: true,
      purchase: 11,
      deserving: 15,
      poor: 20,
      member: 25,
      general: 32,
    },
    {
      id: ITEM_IDS.ORS,
      categoryId: CATEGORY_IDS.SYRUPS,
      name: 'ORS Sachet',
      barcode: '8901030895708',
      tracksStock: true,
      purchase: 5,
      deserving: 8,
      poor: 10,
      member: 12,
      general: 15,
    },
    {
      id: ITEM_IDS.CALPOL,
      categoryId: CATEGORY_IDS.SYRUPS,
      name: 'Calpol Syrup 60ml',
      barcode: '8901030895715',
      tracksStock: true,
      purchase: 55,
      deserving: 70,
      poor: 85,
      member: 100,
      general: 120,
    },
    {
      id: ITEM_IDS.VENTOLIN_SYR,
      categoryId: CATEGORY_IDS.SYRUPS,
      name: 'Ventolin Syrup',
      barcode: '8901030895722',
      tracksStock: true,
      purchase: 48,
      deserving: 65,
      poor: 80,
      member: 95,
      general: 110,
    },
    {
      id: ITEM_IDS.AUGMENTIN_SYR,
      categoryId: CATEGORY_IDS.SYRUPS,
      name: 'Augmentin Syrup 156mg',
      barcode: '8901030895739',
      tracksStock: true,
      purchase: 180,
      deserving: 220,
      poor: 260,
      member: 300,
      general: 350,
    },
    {
      id: ITEM_IDS.FLAGYL_SYR,
      categoryId: CATEGORY_IDS.SYRUPS,
      name: 'Flagyl Suspension',
      barcode: '8901030895746',
      tracksStock: true,
      purchase: 42,
      deserving: 55,
      poor: 68,
      member: 80,
      general: 95,
    },
    {
      id: ITEM_IDS.DICLO_INJ,
      categoryId: CATEGORY_IDS.INJECTIONS,
      name: 'Diclofenac Injection',
      barcode: '8901030895753',
      tracksStock: true,
      purchase: 18,
      deserving: 25,
      poor: 35,
      member: 45,
      general: 55,
    },
    {
      id: ITEM_IDS.CEFTRIAXONE,
      categoryId: CATEGORY_IDS.INJECTIONS,
      name: 'Ceftriaxone 1g',
      barcode: '8901030895760',
      tracksStock: true,
      purchase: 95,
      deserving: 120,
      poor: 150,
      member: 180,
      general: 220,
    },
    {
      id: ITEM_IDS.INSULIN,
      categoryId: CATEGORY_IDS.INJECTIONS,
      name: 'Insulin Regular 100IU',
      barcode: '8901030895777',
      tracksStock: true,
      purchase: 320,
      deserving: 400,
      poor: 480,
      member: 560,
      general: 650,
    },
    {
      id: ITEM_IDS.DEXA,
      categoryId: CATEGORY_IDS.INJECTIONS,
      name: 'Dexamethasone Injection',
      barcode: '8901030895784',
      tracksStock: true,
      purchase: 22,
      deserving: 30,
      poor: 40,
      member: 50,
      general: 65,
    },
    {
      id: ITEM_IDS.CBC,
      categoryId: CATEGORY_IDS.LAB,
      name: 'CBC',
      tracksStock: false,
      purchase: 80,
      deserving: 150,
      poor: 200,
      member: 250,
      general: 300,
    },
    {
      id: ITEM_IDS.LFT,
      categoryId: CATEGORY_IDS.LAB,
      name: 'LFT',
      tracksStock: false,
      purchase: 120,
      deserving: 250,
      poor: 350,
      member: 450,
      general: 550,
    },
    {
      id: ITEM_IDS.RFT,
      categoryId: CATEGORY_IDS.LAB,
      name: 'RFT',
      tracksStock: false,
      purchase: 100,
      deserving: 200,
      poor: 280,
      member: 360,
      general: 450,
    },
    {
      id: ITEM_IDS.BLOOD_SUGAR,
      categoryId: CATEGORY_IDS.LAB,
      name: 'Blood Sugar (Random)',
      tracksStock: false,
      purchase: 20,
      deserving: 50,
      poor: 80,
      member: 100,
      general: 150,
    },
    {
      id: ITEM_IDS.OPD,
      categoryId: CATEGORY_IDS.CONSULT,
      name: 'OPD Consultation',
      tracksStock: false,
      purchase: 0,
      deserving: 50,
      poor: 100,
      member: 200,
      general: 500,
    },
    {
      id: ITEM_IDS.FOLLOWUP,
      categoryId: CATEGORY_IDS.CONSULT,
      name: 'Follow-up Consultation',
      tracksStock: false,
      purchase: 0,
      deserving: 0,
      poor: 50,
      member: 100,
      general: 250,
    },
    {
      id: ITEM_IDS.ULTRASOUND,
      categoryId: CATEGORY_IDS.PROC,
      name: 'Ultrasound',
      tracksStock: false,
      purchase: 200,
      deserving: 400,
      poor: 600,
      member: 800,
      general: 1200,
    },
    {
      id: ITEM_IDS.ECG,
      categoryId: CATEGORY_IDS.PROC,
      name: 'ECG',
      tracksStock: false,
      purchase: 50,
      deserving: 100,
      poor: 150,
      member: 200,
      general: 300,
    },
  ];

  const items: { id: string; name: string; tracksStock: boolean }[] = [];

  for (const it of itemDefs) {
    const row = await prisma.item.upsert({
      where: { id: it.id },
      create: {
        id: it.id,
        categoryId: it.categoryId,
        name: it.name,
        barcode: it.barcode,
        tracksStock: it.tracksStock,
        active: true,
      },
      update: {
        categoryId: it.categoryId,
        name: it.name,
        barcode: it.barcode,
        tracksStock: it.tracksStock,
        active: true,
      },
    });
    items.push({
      id: row.id,
      name: row.name,
      tracksStock: row.tracksStock,
    });

    await prisma.branchItemPrice.upsert({
      where: {
        branchId_itemId: { branchId: SEED_BRANCH_ID, itemId: it.id },
      },
      create: {
        branchId: SEED_BRANCH_ID,
        itemId: it.id,
        purchasePrice: d(it.purchase),
        priceDeserving: d(it.deserving),
        pricePoor: d(it.poor),
        priceMember: d(it.member),
        priceGeneral: d(it.general),
      },
      update: {
        purchasePrice: d(it.purchase),
        priceDeserving: d(it.deserving),
        pricePoor: d(it.poor),
        priceMember: d(it.member),
        priceGeneral: d(it.general),
      },
    });
  }

  // -------------------------------------------------------------------------
  // 4b. Registration fees (all four patient categories)
  // -------------------------------------------------------------------------
  for (const category of Object.values(PatientCategory)) {
    const amount = REGISTRATION_FEES[category];
    await prisma.registrationFee.upsert({
      where: {
        branchId_category: { branchId: SEED_BRANCH_ID, category },
      },
      create: {
        branchId: SEED_BRANCH_ID,
        category,
        amount: d(amount),
      },
      update: {
        amount: d(amount),
      },
    });
  }

  // -------------------------------------------------------------------------
  // 5. BranchStock + OPENING StockMovement
  // -------------------------------------------------------------------------
  const stockQuantities: Record<string, number> = {
    [ITEM_IDS.PANADOL]: 420,
    [ITEM_IDS.BRUFEN]: 310,
    [ITEM_IDS.AUGMENTIN]: 95,
    [ITEM_IDS.AMOXIL]: 180,
    [ITEM_IDS.FLAGYL]: 240,
    [ITEM_IDS.DISPRIN]: 500,
    [ITEM_IDS.CLARITIN]: 75,
    [ITEM_IDS.RISEK]: 130,
    [ITEM_IDS.ORS]: 350,
    [ITEM_IDS.CALPOL]: 88,
    [ITEM_IDS.VENTOLIN_SYR]: 64,
    [ITEM_IDS.AUGMENTIN_SYR]: 52,
    [ITEM_IDS.FLAGYL_SYR]: 70,
    [ITEM_IDS.DICLO_INJ]: 145,
    [ITEM_IDS.CEFTRIAXONE]: 60,
    [ITEM_IDS.INSULIN]: 55,
    [ITEM_IDS.DEXA]: 110,
  };

  let stockCount = 0;
  let openingMovements = 0;

  for (const item of items.filter((i) => i.tracksStock)) {
    const qty = stockQuantities[item.id] ?? 100;

    await prisma.branchStock.upsert({
      where: {
        branchId_itemId: { branchId: SEED_BRANCH_ID, itemId: item.id },
      },
      create: {
        branchId: SEED_BRANCH_ID,
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

    const movementId = openingMovementId(item.id);
    await prisma.stockMovement.upsert({
      where: { id: movementId },
      create: {
        id: movementId,
        branchId: SEED_BRANCH_ID,
        itemId: item.id,
        delta: d(qty),
        reason: MovementReason.ADJUSTMENT,
        refType: 'OPENING',
        refId: SEED_BRANCH_ID,
        note: 'Opening balance (seed)',
        createdBy: SYSTEM_ACTOR_ID,
      },
      update: {
        delta: d(qty),
        reason: MovementReason.ADJUSTMENT,
        refType: 'OPENING',
        refId: SEED_BRANCH_ID,
        note: 'Opening balance (seed)',
      },
    });
    openingMovements++;
  }

  // -------------------------------------------------------------------------
  // 6. Patients (upsert by stable id; unique key is also branchId+mrNo)
  // -------------------------------------------------------------------------
  const patientDefs: {
    id: string;
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
      id: PATIENT_IDS.PAT_01,
      mrNo: 'CH-00001',
      name: 'Muhammad Asif',
      gender: Gender.MALE,
      ageYears: 42,
      phone: '03001234567',
      cnic: '61101-1234567-1',
    },
    {
      id: PATIENT_IDS.PAT_02,
      mrNo: 'CH-00002',
      name: 'Ayesha Bibi',
      gender: Gender.FEMALE,
      ageYears: 28,
      phone: '03019876543',
      cnic: '61101-7654321-2',
    },
    {
      id: PATIENT_IDS.PAT_03,
      mrNo: 'CH-00003',
      name: 'Hassan Raza',
      gender: Gender.MALE,
      ageYears: 7,
      phone: '03331234567',
      guardianName: 'Imran Raza',
      guardianPhone: '03331234567',
    },
    {
      id: PATIENT_IDS.PAT_04,
      mrNo: 'CH-00004',
      name: 'Zainab Fatima',
      gender: Gender.FEMALE,
      ageYears: 55,
      phone: '03215551234',
      cnic: '37405-1122334-5',
    },
    {
      id: PATIENT_IDS.PAT_05,
      mrNo: 'CH-00005',
      name: 'Ali Haider',
      gender: Gender.MALE,
      ageYears: 33,
      cnic: '35202-9988776-3',
    },
    {
      id: PATIENT_IDS.PAT_06,
      mrNo: 'CH-00006',
      name: 'Saima Noreen',
      gender: Gender.FEMALE,
      ageYears: 19,
      phone: '03451112233',
    },
    {
      id: PATIENT_IDS.PAT_07,
      mrNo: 'CH-00007',
      name: 'Omar Farooq',
      gender: Gender.MALE,
      ageYears: 61,
      phone: '03005556677',
      cnic: '61101-5544332-1',
      address: 'Sector G-9, Islamabad',
    },
    {
      id: PATIENT_IDS.PAT_08,
      mrNo: 'CH-00008',
      name: 'Maryam Shah',
      gender: Gender.FEMALE,
      ageYears: 36,
      phone: '03129998877',
    },
    {
      id: PATIENT_IDS.PAT_09,
      mrNo: 'CH-00009',
      name: 'Bilal Ahmed',
      gender: Gender.MALE,
      ageYears: 14,
      guardianName: 'Khalid Ahmed',
      guardianPhone: '03007778899',
    },
    {
      id: PATIENT_IDS.PAT_10,
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
      where: { id: p.id },
      create: {
        id: p.id,
        branchId: SEED_BRANCH_ID,
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
  const issuedAt1 = new Date('2026-07-20T09:00:00+05:00');
  const issuedAt2 = new Date('2026-07-22T14:30:00+05:00');

  await prisma.transfer.upsert({
    where: { id: TRANSFER_IDS.XFER_001 },
    create: {
      id: TRANSFER_IDS.XFER_001,
      branchId: SEED_BRANCH_ID,
      transferNo: 'ST-2026-0142',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt1,
      issuedBy: STAFF_IDS.PHARM_BILAL,
    },
    update: {
      transferNo: 'ST-2026-0142',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt1,
      issuedBy: STAFF_IDS.PHARM_BILAL,
      receivedAt: null,
      receivedBy: null,
    },
  });

  const transfer1Lines = [
    {
      id: TRANSFER_LINE_IDS.XFER_001_L1,
      itemId: ITEM_IDS.PANADOL,
      qty: 100,
    },
    {
      id: TRANSFER_LINE_IDS.XFER_001_L2,
      itemId: ITEM_IDS.AUGMENTIN,
      qty: 40,
    },
    { id: TRANSFER_LINE_IDS.XFER_001_L3, itemId: ITEM_IDS.ORS, qty: 80 },
    {
      id: TRANSFER_LINE_IDS.XFER_001_L4,
      itemId: ITEM_IDS.CEFTRIAXONE,
      qty: 25,
    },
  ];

  for (const line of transfer1Lines) {
    await prisma.transferLine.upsert({
      where: { id: line.id },
      create: {
        id: line.id,
        transferId: TRANSFER_IDS.XFER_001,
        itemId: line.itemId,
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
      },
      update: {
        itemId: line.itemId,
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
        varianceNote: null,
      },
    });
  }

  await prisma.transfer.upsert({
    where: { id: TRANSFER_IDS.XFER_002 },
    create: {
      id: TRANSFER_IDS.XFER_002,
      branchId: SEED_BRANCH_ID,
      transferNo: 'ST-2026-0158',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt2,
      issuedBy: STAFF_IDS.PHARM_BILAL,
    },
    update: {
      transferNo: 'ST-2026-0158',
      status: TransferStatus.ISSUED,
      issuedAt: issuedAt2,
      issuedBy: STAFF_IDS.PHARM_BILAL,
      receivedAt: null,
      receivedBy: null,
    },
  });

  const transfer2Lines = [
    { id: TRANSFER_LINE_IDS.XFER_002_L1, itemId: ITEM_IDS.CALPOL, qty: 30 },
    { id: TRANSFER_LINE_IDS.XFER_002_L2, itemId: ITEM_IDS.INSULIN, qty: 15 },
    { id: TRANSFER_LINE_IDS.XFER_002_L3, itemId: ITEM_IDS.BRUFEN, qty: 60 },
  ];

  for (const line of transfer2Lines) {
    await prisma.transferLine.upsert({
      where: { id: line.id },
      create: {
        id: line.id,
        transferId: TRANSFER_IDS.XFER_002,
        itemId: line.itemId,
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
      },
      update: {
        itemId: line.itemId,
        issuedQuantity: d(line.qty),
        receivedQuantity: null,
        varianceNote: null,
      },
    });
  }

  console.log('\nYCDO HMS seed complete (idempotent upserts)\n');
  console.log(`  Branch:       ${branch.name} [${branch.code}] ${branch.id}`);
  console.log(
    `  Staff:        ${staff.length} (${staff.filter((s) => s.isDoctor).length} doctors)`,
  );
  console.log(`  Categories:   ${categoryDefs.length}`);
  console.log(
    `  Items:        ${items.length} (${items.filter((i) => i.tracksStock).length} track stock)`,
  );
  console.log(`  BranchPrices: ${items.length} (branch ${SEED_BRANCH_CODE})`);
  console.log(
    `  RegFees:      ${Object.keys(REGISTRATION_FEES).length} categories`,
  );
  console.log(
    `  BranchStock:  ${stockCount} rows + ${openingMovements} OPENING movements`,
  );
  console.log(`  Patients:     ${patientCount} (mrNo CH-00001 …)`);
  console.log(
    `  Transfers:    2 ISSUED (ST-2026-0142: 4 lines, ST-2026-0158: 3 lines)`,
  );
  console.log('');
  console.log(`  CapRover BRANCH_ID must be: ${SEED_BRANCH_ID}`);
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
