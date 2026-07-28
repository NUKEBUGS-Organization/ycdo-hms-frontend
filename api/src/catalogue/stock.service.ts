import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchConfig } from '../common/config/branch.config';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchConfig,
  ) {}

  /**
   * available = on-hand − active unexpired reservations.
   * Expiry is evaluated in SQL so lapsed holds drop out without a sweep.
   * Pass excludeCartId to ignore a cart's own holds (token-save backstop).
   */
  async getAvailable(
    itemIds: string[],
    opts?: {
      db?: Db;
      excludeCartId?: string;
    },
  ): Promise<Map<string, Prisma.Decimal>> {
    const result = new Map<string, Prisma.Decimal>();
    if (itemIds.length === 0) return result;

    const db = opts?.db ?? this.prisma;
    const branchId = this.branch.branchId;
    const idList = Prisma.join(
      itemIds.map((id) => Prisma.sql`${id}::uuid`),
    );

    const excludeCart = opts?.excludeCartId
      ? Prisma.sql`AND sr."cartId" <> ${opts.excludeCartId}::uuid`
      : Prisma.empty;

    const rows = await db.$queryRaw<
      { itemId: string; available: Prisma.Decimal }[]
    >`
      SELECT
        i.id AS "itemId",
        COALESCE(bs.quantity, 0) - COALESCE((
          SELECT SUM(sr.quantity)
          FROM stock_reservations sr
          WHERE sr."branchId" = ${branchId}::uuid
            AND sr."itemId" = i.id
            AND sr.status = 'ACTIVE'
            AND sr."expiresAt" > (NOW() AT TIME ZONE 'UTC')
            ${excludeCart}
        ), 0) AS available
      FROM items i
      LEFT JOIN branch_stock bs
        ON bs."itemId" = i.id
       AND bs."branchId" = ${branchId}::uuid
      WHERE i.id IN (${idList})
    `;

    for (const row of rows) {
      result.set(row.itemId, new Prisma.Decimal(row.available));
    }

    for (const id of itemIds) {
      if (!result.has(id)) {
        result.set(id, new Prisma.Decimal(0));
      }
    }

    return result;
  }

  async listStock(belowMin = false) {
    const branchId = this.branch.branchId;

    const rows = await this.prisma.$queryRaw<
      {
        itemId: string;
        itemName: string;
        onHand: Prisma.Decimal;
        reserved: Prisma.Decimal;
        available: Prisma.Decimal;
        minLimit: number;
        maxLimit: number;
      }[]
    >`
      SELECT
        bs."itemId",
        i.name AS "itemName",
        bs.quantity AS "onHand",
        COALESCE(r.reserved, 0) AS reserved,
        bs.quantity - COALESCE(r.reserved, 0) AS available,
        bs."minLimit",
        bs."maxLimit"
      FROM branch_stock bs
      JOIN items i ON i.id = bs."itemId"
      LEFT JOIN (
        SELECT "itemId", SUM(quantity) AS reserved
        FROM stock_reservations
        WHERE "branchId" = ${branchId}::uuid
          AND status = 'ACTIVE'
          AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
        GROUP BY "itemId"
      ) r ON r."itemId" = bs."itemId"
      WHERE bs."branchId" = ${branchId}::uuid
        AND (
          ${belowMin} = false
          OR bs.quantity < bs."minLimit"
        )
      ORDER BY i.name ASC
    `;

    return rows.map((row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      onHand: new Prisma.Decimal(row.onHand),
      reserved: new Prisma.Decimal(row.reserved),
      available: new Prisma.Decimal(row.available),
      minLimit: row.minLimit,
      maxLimit: row.maxLimit,
    }));
  }

  async listMovements(itemId: string, page: number, limit: number) {
    const branchId = this.branch.branchId;
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.stockMovement.count({
        where: { branchId, itemId },
      }),
      this.prisma.stockMovement.findMany({
        where: { branchId, itemId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          reason: true,
          delta: true,
          refType: true,
          refId: true,
          createdBy: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      total,
      page: Math.max(page, 1),
      limit: take,
      data: rows,
    };
  }
}
