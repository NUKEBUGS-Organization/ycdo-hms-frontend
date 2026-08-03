import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MovementReason,
  Prisma,
  ReceivableStatus,
  TokenStatus,
  TokenType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveUnitPrice } from '../catalogue/pricing';
import { StockService } from '../catalogue/stock.service';
import { BranchConfig } from '../common/config/branch.config';
import { SYSTEM_ACTOR_ID } from '../common/constants';
import { pktDateOnly, nowPkt } from '../common/utils/date.util';
import {
  multiplyMoney,
  roundMoney,
  sumMoney,
} from '../common/utils/money.util';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabTokenDto } from './dto/create-lab-token.dto';
import { CreateRegistrationTokenDto } from './dto/create-registration-token.dto';
import { CreateTokenDto } from './dto/create-token.dto';
import { ReturnTokenDto } from './dto/return-token.dto';

const tokenInclude = {
  lines: {
    include: {
      item: {
        select: { id: true, name: true, barcode: true, tracksStock: true },
      },
    },
  },
  patient: true,
  doctor: { select: { id: true, fullName: true, designation: true } },
  receivable: true,
  return: true,
} satisfies Prisma.TokenInclude;

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchConfig,
    private readonly patients: PatientsService,
    private readonly stock: StockService,
  ) {}

  /**
   * PHARMACY dispense — existing patient only, always chained via previousTokenId.
   * Partial payment allowed → Receivable. tokenFee is always 0.
   */
  async create(dto: CreateTokenDto) {
    const amountReceived = new Prisma.Decimal(dto.amountReceived);
    if (amountReceived.lt(0)) {
      throw new BadRequestException('amountReceived cannot be negative');
    }

    const branchId = this.branch.branchId;
    const today = pktDateOnly(nowPkt());
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];

    return this.prisma.$transaction(async (tx) => {
      // --- 1. Patient (existing only — never create here) ---
      const existing = await tx.patient.findFirst({
        where: { id: dto.patientId, branchId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Patient ${dto.patientId} not found`);
      }
      const patientId = existing.id;

      const doctor = await tx.staff.findFirst({
        where: { id: dto.doctorId, active: true },
        select: { id: true },
      });
      if (!doctor) {
        throw new NotFoundException(`Doctor ${dto.doctorId} not found`);
      }

      // --- 2. previousTokenId must exist and belong to this patient ---
      const prev = await tx.token.findFirst({
        where: { id: dto.previousTokenId, branchId },
        select: { id: true, patientId: true },
      });
      if (!prev || prev.patientId !== patientId) {
        throw new BadRequestException(
          `previousTokenId ${dto.previousTokenId} must exist and belong to patient ${patientId}`,
        );
      }

      const items = await tx.item.findMany({
        where: { id: { in: itemIds }, active: true },
      });
      if (items.length !== itemIds.length) {
        const found = new Set(items.map((i) => i.id));
        const missing = itemIds.filter((id) => !found.has(id));
        throw new NotFoundException(`Items not found: ${missing.join(', ')}`);
      }
      const itemById = new Map(items.map((i) => [i.id, i]));

      const branchPrices = await tx.branchItemPrice.findMany({
        where: { branchId, itemId: { in: itemIds } },
      });
      const priceByItemId = new Map(branchPrices.map((p) => [p.itemId, p]));
      for (const itemId of itemIds) {
        if (!priceByItemId.has(itemId)) {
          const item = itemById.get(itemId)!;
          throw new BadRequestException(
            `No branch price for item ${item.name} (${itemId}) at this branch`,
          );
        }
      }

      // --- 3. Token number (branch + date — shared across all TokenTypes) ---
      const tokenNo = await this.allocateTokenNo(tx, branchId, today);

      // --- 4–5. Line pricing (BranchItemPrice; tokenType PHARMACY, tokenFee 0) ---
      const lineData = dto.lines.map((line) => {
        const item = itemById.get(line.itemId)!;
        const price = priceByItemId.get(line.itemId)!;
        const fixDose = line.fixDose ?? 0;
        const quantity =
          fixDose > 0
            ? new Prisma.Decimal(fixDose)
            : multiplyMoney(
                new Prisma.Decimal(line.dose),
                multiplyMoney(new Prisma.Decimal(line.feed), line.days),
              );

        if (quantity.lte(0)) {
          throw new BadRequestException(
            `Line quantity must be positive for item ${item.name}`,
          );
        }

        const unitPrice = resolveUnitPrice(price, dto.category);
        const lineTotal = roundMoney(multiplyMoney(quantity, unitPrice));

        return {
          itemId: item.id,
          dose: line.dose,
          feed: new Prisma.Decimal(line.feed),
          days: line.days,
          fixDose,
          quantity,
          unitPrice,
          lineTotal,
          purchasePrice: price.purchasePrice,
          tracksStock: item.tracksStock,
          itemName: item.name,
        };
      });

      const totalAmount = roundMoney(
        sumMoney(...lineData.map((l) => l.lineTotal)),
      );

      const tokenId = randomUUID();

      await tx.token.create({
        data: {
          id: tokenId,
          branchId,
          tokenNo,
          tokenDate: today,
          patientId,
          doctorId: dto.doctorId,
          tokenType: TokenType.PHARMACY,
          tokenFee: new Prisma.Decimal(0),
          category: dto.category,
          totalAmount,
          amountReceived,
          previousTokenId: dto.previousTokenId,
          createdBy: SYSTEM_ACTOR_ID,
          lines: {
            create: lineData.map((l) => ({
              itemId: l.itemId,
              dose: l.dose,
              feed: l.feed,
              days: l.days,
              fixDose: l.fixDose,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              purchasePrice: l.purchasePrice,
            })),
          },
        },
      });

      const persisted = await tx.tokenLine.findMany({
        where: { tokenId },
        select: { lineTotal: true },
      });
      const persistedSum = roundMoney(
        sumMoney(...persisted.map((l) => l.lineTotal)),
      );
      if (!persistedSum.equals(totalAmount)) {
        throw new BadRequestException(
          `totalAmount mismatch: computed ${totalAmount.toString()}, persisted ${persistedSum.toString()}`,
        );
      }

      // --- 6. Stock movements + BranchStock ---
      const stockLines = lineData.filter((l) => l.tracksStock);
      if (stockLines.length > 0) {
        // Aggregate qty per item (duplicate lines possible)
        const needByItem = new Map<string, Prisma.Decimal>();
        for (const line of stockLines) {
          needByItem.set(
            line.itemId,
            (needByItem.get(line.itemId) ?? new Prisma.Decimal(0)).add(
              line.quantity,
            ),
          );
        }

        // Lock stock rows first, then re-check availability excluding this cart.
        for (const [itemId, needed] of needByItem) {
          const locked = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
            UPDATE branch_stock
            SET "updatedAt" = CURRENT_TIMESTAMP
            WHERE "branchId" = ${branchId}::uuid AND "itemId" = ${itemId}::uuid
            RETURNING quantity
          `;
          if (locked.length === 0) {
            const name =
              stockLines.find((l) => l.itemId === itemId)?.itemName ?? itemId;
            throw new ConflictException(
              `Insufficient stock for item ${name}: available 0, requested ${needed.toString()}`,
            );
          }
        }

        const available = await this.stock.getAvailable(
          [...needByItem.keys()],
          { db: tx, excludeCartId: dto.cartId },
        );

        for (const [itemId, needed] of needByItem) {
          const avail = available.get(itemId) ?? new Prisma.Decimal(0);
          if (avail.lt(needed)) {
            const name =
              stockLines.find((l) => l.itemId === itemId)?.itemName ?? itemId;
            throw new ConflictException(
              `Insufficient stock for item ${name}: available ${avail.toString()}, requested ${needed.toString()}`,
            );
          }
        }

        for (const line of stockLines) {
          await tx.stockMovement.create({
            data: {
              branchId,
              itemId: line.itemId,
              delta: line.quantity.neg(),
              reason: MovementReason.SALE,
              refType: 'TOKEN',
              refId: tokenId,
              createdBy: SYSTEM_ACTOR_ID,
            },
          });

          await tx.branchStock.update({
            where: {
              branchId_itemId: { branchId, itemId: line.itemId },
            },
            data: {
              quantity: { decrement: line.quantity },
            },
          });
        }
      }

      // --- 7. Consume cart reservations ---
      await tx.stockReservation.updateMany({
        where: {
          branchId,
          cartId: dto.cartId,
          status: 'ACTIVE',
        },
        data: {
          status: 'CONSUMED',
          tokenId,
        },
      });

      // --- 8–9. Receivable if underpaid (pharmacy allows partial payment) ---
      if (amountReceived.lt(totalAmount)) {
        const amountDue = roundMoney(totalAmount.sub(amountReceived));
        await tx.receivable.create({
          data: {
            branchId,
            tokenId,
            amountDue,
            amountPaid: new Prisma.Decimal(0),
            guardianName: dto.receivable?.guardianName,
            guardianPhone: dto.receivable?.guardianPhone,
            recommendedBy: dto.receivable?.recommendedBy,
            promisedDate: dto.receivable?.promisedDate
              ? pktDateOnly(dto.receivable.promisedDate)
              : undefined,
            status: ReceivableStatus.OPEN,
            createdBy: SYSTEM_ACTOR_ID,
          },
        });
      }

      // --- 10. Print-shaped payload (same shape as registration) ---
      return tx.token.findUniqueOrThrow({
        where: { id: tokenId },
        include: tokenInclude,
      });
    });
  }

  /**
   * LAB order — existing patient only, always chained via previousTokenId.
   * Lines must be non-stock items. No reservations / StockMovement / BranchStock.
   * Partial payment allowed → Receivable. tokenFee is always 0.
   */
  async createLab(dto: CreateLabTokenDto) {
    const amountReceived = new Prisma.Decimal(dto.amountReceived);
    if (amountReceived.lt(0)) {
      throw new BadRequestException('amountReceived cannot be negative');
    }

    const branchId = this.branch.branchId;
    const today = pktDateOnly(nowPkt());
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];

    return this.prisma.$transaction(async (tx) => {
      // --- 1. Patient + previousTokenId (same checks as pharmacy) ---
      const existing = await tx.patient.findFirst({
        where: { id: dto.patientId, branchId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException(`Patient ${dto.patientId} not found`);
      }
      const patientId = existing.id;

      const doctor = await tx.staff.findFirst({
        where: { id: dto.doctorId, active: true },
        select: { id: true },
      });
      if (!doctor) {
        throw new NotFoundException(`Doctor ${dto.doctorId} not found`);
      }

      const prev = await tx.token.findFirst({
        where: { id: dto.previousTokenId, branchId },
        select: { id: true, patientId: true },
      });
      if (!prev || prev.patientId !== patientId) {
        throw new BadRequestException(
          `previousTokenId ${dto.previousTokenId} must exist and belong to patient ${patientId}`,
        );
      }

      const items = await tx.item.findMany({
        where: { id: { in: itemIds }, active: true },
      });
      if (items.length !== itemIds.length) {
        const found = new Set(items.map((i) => i.id));
        const missing = itemIds.filter((id) => !found.has(id));
        throw new NotFoundException(`Items not found: ${missing.join(', ')}`);
      }
      const itemById = new Map(items.map((i) => [i.id, i]));

      // --- 4. Every line must be non-stock (lab never carries pharmacy items) ---
      for (const item of items) {
        if (item.tracksStock) {
          throw new BadRequestException(
            `Lab token cannot include stock-tracked item ${item.name} (${item.id})`,
          );
        }
      }

      const branchPrices = await tx.branchItemPrice.findMany({
        where: { branchId, itemId: { in: itemIds } },
      });
      const priceByItemId = new Map(branchPrices.map((p) => [p.itemId, p]));
      for (const itemId of itemIds) {
        if (!priceByItemId.has(itemId)) {
          const item = itemById.get(itemId)!;
          throw new BadRequestException(
            `No branch price for item ${item.name} (${itemId}) at this branch`,
          );
        }
      }

      // --- 2–3. Shared TokenCounter; tokenType LAB, tokenFee 0 ---
      const tokenNo = await this.allocateTokenNo(tx, branchId, today);

      // --- 5. Line pricing (same BranchItemPrice / resolveUnitPrice as pharmacy) ---
      const lineData = dto.lines.map((line) => {
        const item = itemById.get(line.itemId)!;
        const price = priceByItemId.get(line.itemId)!;
        const quantity = new Prisma.Decimal(line.quantity);

        if (quantity.lte(0)) {
          throw new BadRequestException(
            `Line quantity must be positive for item ${item.name}`,
          );
        }

        const unitPrice = resolveUnitPrice(price, dto.category);
        const lineTotal = roundMoney(multiplyMoney(quantity, unitPrice));

        return {
          itemId: item.id,
          quantity,
          unitPrice,
          lineTotal,
          purchasePrice: price.purchasePrice,
        };
      });

      // --- 7. Total (+ receivable if underpaid) ---
      const totalAmount = roundMoney(
        sumMoney(...lineData.map((l) => l.lineTotal)),
      );

      const tokenId = randomUUID();

      await tx.token.create({
        data: {
          id: tokenId,
          branchId,
          tokenNo,
          tokenDate: today,
          patientId,
          doctorId: dto.doctorId,
          tokenType: TokenType.LAB,
          tokenFee: new Prisma.Decimal(0),
          category: dto.category,
          totalAmount,
          amountReceived,
          previousTokenId: dto.previousTokenId,
          createdBy: SYSTEM_ACTOR_ID,
          lines: {
            create: lineData.map((l) => ({
              itemId: l.itemId,
              dose: 0,
              feed: new Prisma.Decimal(0),
              days: 0,
              fixDose: 0,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              purchasePrice: l.purchasePrice,
            })),
          },
        },
      });

      const persisted = await tx.tokenLine.findMany({
        where: { tokenId },
        select: { lineTotal: true },
      });
      const persistedSum = roundMoney(
        sumMoney(...persisted.map((l) => l.lineTotal)),
      );
      if (!persistedSum.equals(totalAmount)) {
        throw new BadRequestException(
          `totalAmount mismatch: computed ${totalAmount.toString()}, persisted ${persistedSum.toString()}`,
        );
      }

      // --- 6. Intentionally no StockReservation / StockMovement / BranchStock ---

      if (amountReceived.lt(totalAmount)) {
        const amountDue = roundMoney(totalAmount.sub(amountReceived));
        await tx.receivable.create({
          data: {
            branchId,
            tokenId,
            amountDue,
            amountPaid: new Prisma.Decimal(0),
            guardianName: dto.receivable?.guardianName,
            guardianPhone: dto.receivable?.guardianPhone,
            recommendedBy: dto.receivable?.recommendedBy,
            promisedDate: dto.receivable?.promisedDate
              ? pktDateOnly(dto.receivable.promisedDate)
              : undefined,
            status: ReceivableStatus.OPEN,
            createdBy: SYSTEM_ACTOR_ID,
          },
        });
      }

      // --- 8. Print-shaped payload ---
      return tx.token.findUniqueOrThrow({
        where: { id: tokenId },
        include: tokenInclude,
      });
    });
  }

  /**
   * REGISTRATION token — flat fee, no lines, always paid in full.
   * Shares TokenCounter (branch+date) with pharmacy / lab / referral.
   */
  async createRegistration(dto: CreateRegistrationTokenDto) {
    if (!dto.patientId && !dto.newPatient) {
      throw new BadRequestException(
        'Either patientId or newPatient is required',
      );
    }
    if (dto.patientId && dto.newPatient) {
      throw new BadRequestException(
        'Provide patientId or newPatient, not both',
      );
    }

    const branchId = this.branch.branchId;
    const branchCode = this.branch.branchCode;
    const today = pktDateOnly(nowPkt());

    return this.prisma.$transaction(async (tx) => {
      let patientId: string;
      if (dto.newPatient) {
        const patient = await this.patients.createWithTx(tx, dto.newPatient);
        patientId = patient.id;
      } else {
        const existing = await tx.patient.findFirst({
          where: { id: dto.patientId!, branchId },
          select: { id: true },
        });
        if (!existing) {
          throw new NotFoundException(`Patient ${dto.patientId} not found`);
        }
        patientId = existing.id;
      }

      const doctor = await tx.staff.findFirst({
        where: { id: dto.doctorId, active: true },
        select: { id: true },
      });
      if (!doctor) {
        throw new NotFoundException(`Doctor ${dto.doctorId} not found`);
      }

      const fee = await tx.registrationFee.findUnique({
        where: {
          branchId_category: { branchId, category: dto.category },
        },
      });
      if (!fee) {
        throw new BadRequestException(
          `No RegistrationFee for branch ${branchCode} (${branchId}) category ${dto.category} — seed registration fees before issuing registration tokens`,
        );
      }

      const tokenFee = fee.amount;
      const tokenNo = await this.allocateTokenNo(tx, branchId, today);
      const tokenId = randomUUID();

      await tx.token.create({
        data: {
          id: tokenId,
          branchId,
          tokenNo,
          tokenDate: today,
          patientId,
          doctorId: dto.doctorId,
          tokenType: TokenType.REGISTRATION,
          tokenFee,
          category: dto.category,
          totalAmount: tokenFee,
          amountReceived: tokenFee,
          createdBy: SYSTEM_ACTOR_ID,
        },
      });

      return tx.token.findUniqueOrThrow({
        where: { id: tokenId },
        include: tokenInclude,
      });
    });
  }

  /** Shared per-branch-per-day sequence — not per TokenType. */
  private async allocateTokenNo(
    tx: Prisma.TransactionClient,
    branchId: string,
    today: Date,
  ): Promise<number> {
    await tx.$executeRaw`
      INSERT INTO token_counters ("branchId", date, "lastNo")
      VALUES (${branchId}::uuid, ${today}::date, 0)
      ON CONFLICT ("branchId", date) DO NOTHING
    `;

    const counters = await tx.$queryRaw<{ lastNo: number }[]>`
      SELECT "lastNo" FROM token_counters
      WHERE "branchId" = ${branchId}::uuid AND date = ${today}::date
      FOR UPDATE
    `;
    const tokenNo = (counters[0]?.lastNo ?? 0) + 1;

    await tx.$executeRaw`
      UPDATE token_counters
      SET "lastNo" = ${tokenNo}
      WHERE "branchId" = ${branchId}::uuid AND date = ${today}::date
    `;

    return tokenNo;
  }

  async findOne(id: string) {
    const token = await this.prisma.token.findFirst({
      where: { id, branchId: this.branch.branchId },
      include: tokenInclude,
    });
    if (!token) {
      throw new NotFoundException(`Token ${id} not found`);
    }
    return token;
  }

  async list(opts: {
    date?: string;
    patientId?: string;
    doctorId?: string;
    tokenNo?: number;
    page: number;
    limit: number;
  }) {
    const take = Math.min(Math.max(opts.limit, 1), 100);
    const page = Math.max(opts.page, 1);
    const skip = (page - 1) * take;

    const where: Prisma.TokenWhereInput = {
      branchId: this.branch.branchId,
    };

    if (opts.date) {
      const d = new Date(opts.date);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid date');
      }
      where.tokenDate = pktDateOnly(d);
    }
    if (opts.patientId) where.patientId = opts.patientId;
    if (opts.doctorId) where.doctorId = opts.doctorId;
    if (opts.tokenNo != null) where.tokenNo = opts.tokenNo;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.token.count({ where }),
      this.prisma.token.findMany({
        where,
        orderBy: [{ tokenDate: 'desc' }, { tokenNo: 'desc' }],
        skip,
        take,
        include: {
          patient: {
            select: {
              id: true,
              mrNo: true,
              name: true,
              gender: true,
              ageYears: true,
              phone: true,
            },
          },
          doctor: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    return { total, page, limit: take, data };
  }

  async returnToken(id: string, dto: ReturnTokenDto) {
    const branchId = this.branch.branchId;
    const amountRefunded = new Prisma.Decimal(dto.amountRefunded);
    if (amountRefunded.lt(0)) {
      throw new BadRequestException('amountRefunded cannot be negative');
    }

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.token.findFirst({
        where: { id, branchId },
        include: {
          lines: {
            include: {
              item: { select: { tracksStock: true, name: true } },
            },
          },
          receivable: true,
          return: true,
        },
      });

      if (!token) {
        throw new NotFoundException(`Token ${id} not found`);
      }
      if (token.status === TokenStatus.RETURNED) {
        throw new ConflictException(`Token ${id} is already returned`);
      }
      if (token.return) {
        throw new ConflictException(`Token ${id} already has a return document`);
      }

      const tokenReturn = await tx.tokenReturn.create({
        data: {
          tokenId: id,
          reason: dto.reason,
          approvedBy: dto.approvedBy,
          amountRefunded,
          restockedToBranch: dto.restockToBranch,
          createdBy: SYSTEM_ACTOR_ID,
        },
      });

      await tx.token.update({
        where: { id },
        data: { status: TokenStatus.RETURNED },
      });

      if (dto.restockToBranch) {
        for (const line of token.lines) {
          if (!line.item.tracksStock) continue;

          await tx.$queryRaw`
            SELECT quantity FROM branch_stock
            WHERE "branchId" = ${branchId}::uuid AND "itemId" = ${line.itemId}::uuid
            FOR UPDATE
          `;

          await tx.stockMovement.create({
            data: {
              branchId,
              itemId: line.itemId,
              delta: line.quantity,
              reason: MovementReason.SALE_RETURN,
              refType: 'RETURN',
              refId: tokenReturn.id,
              createdBy: SYSTEM_ACTOR_ID,
            },
          });

          await tx.branchStock.upsert({
            where: {
              branchId_itemId: { branchId, itemId: line.itemId },
            },
            create: {
              branchId,
              itemId: line.itemId,
              quantity: line.quantity,
            },
            update: {
              quantity: { increment: line.quantity },
            },
          });
        }
      }

      if (token.receivable) {
        await tx.receivable.update({
          where: { id: token.receivable.id },
          data: { status: ReceivableStatus.WRITTEN_OFF },
        });
      }

      return tx.token.findUniqueOrThrow({
        where: { id },
        include: tokenInclude,
      });
    });
  }

  /**
   * Org-side refund flag → full token void + stock reversal.
   * Eventually called by inbound sync; until then the temporary
   * POST /tokens/:id/apply-refund-flag test route invokes this.
   *
   * Idempotent: if status is not ACTIVE, returns the token unchanged
   * (never double-restocks). Does not touch amountReceived/totalAmount.
   */
  async applyRefundFlag(tokenId: string, flaggedBy: string, reason: string) {
    const branchId = this.branch.branchId;

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.token.findFirst({
        where: { id: tokenId, branchId },
        include: {
          lines: {
            include: {
              item: { select: { tracksStock: true, name: true } },
            },
          },
          receivable: true,
        },
      });

      if (!token) {
        throw new NotFoundException(`Token ${tokenId} not found`);
      }

      // --- 1. Idempotency: only ACTIVE tokens are reversed ---
      if (token.status !== TokenStatus.ACTIVE) {
        return tx.token.findUniqueOrThrow({
          where: { id: tokenId },
          include: tokenInclude,
        });
      }

      // --- 2. Flag + status REFUNDED (keep money fields as historical record) ---
      await tx.token.update({
        where: { id: tokenId },
        data: {
          refundFlagged: true,
          refundFlaggedBy: flaggedBy,
          refundFlaggedAt: new Date(),
          refundReason: reason,
          status: TokenStatus.REFUNDED,
        },
      });

      // --- 4. Restock every tracksStock line (LAB lines naturally skip) ---
      for (const line of token.lines) {
        if (!line.item.tracksStock) continue;

        await tx.$queryRaw`
          SELECT quantity FROM branch_stock
          WHERE "branchId" = ${branchId}::uuid AND "itemId" = ${line.itemId}::uuid
          FOR UPDATE
        `;

        await tx.stockMovement.create({
          data: {
            branchId,
            itemId: line.itemId,
            delta: line.quantity,
            reason: MovementReason.SALE_RETURN,
            refType: 'REFUND',
            refId: tokenId,
            createdBy: SYSTEM_ACTOR_ID,
          },
        });

        await tx.branchStock.upsert({
          where: {
            branchId_itemId: { branchId, itemId: line.itemId },
          },
          create: {
            branchId,
            itemId: line.itemId,
            quantity: line.quantity,
          },
          update: {
            quantity: { increment: line.quantity },
          },
        });
      }

      // --- 5. Write off any open receivable ---
      if (token.receivable) {
        await tx.receivable.update({
          where: { id: token.receivable.id },
          data: { status: ReceivableStatus.WRITTEN_OFF },
        });
      }

      return tx.token.findUniqueOrThrow({
        where: { id: tokenId },
        include: tokenInclude,
      });
    });
  }
}
