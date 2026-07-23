import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { StockService } from '../catalogue/stock.service';
import { BranchConfig } from '../common/config/branch.config';
import { SYSTEM_ACTOR_ID } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

const HOLD_MS = 20 * 60 * 1000;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchConfig,
    private readonly stock: StockService,
  ) {}

  async create(dto: CreateReservationDto) {
    const quantity = new Prisma.Decimal(dto.quantity);
    if (quantity.lte(0)) {
      throw new ConflictException('quantity must be positive');
    }

    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
      select: { id: true, tracksStock: true, name: true, active: true },
    });
    if (!item || !item.active) {
      throw new NotFoundException(`Item ${dto.itemId} not found`);
    }

    if (!item.tracksStock) {
      return {
        skipped: true,
        reason: 'ITEM_DOES_NOT_TRACK_STOCK' as const,
        itemId: item.id,
        cartId: dto.cartId,
      };
    }

    const branchId = this.branch.branchId;

    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent holds on this item (same pattern as token save).
      await tx.$queryRaw`
        SELECT quantity FROM branch_stock
        WHERE "branchId" = ${branchId}::uuid AND "itemId" = ${dto.itemId}::uuid
        FOR UPDATE
      `;

      const available = await this.stock.getAvailable([dto.itemId], { db: tx });
      const avail = available.get(dto.itemId) ?? new Prisma.Decimal(0);
      if (avail.lt(quantity)) {
        throw new ConflictException(
          `Insufficient stock for item ${item.name}: available ${avail.toString()}, requested ${quantity.toString()}`,
        );
      }

      return tx.stockReservation.create({
        data: {
          branchId,
          itemId: dto.itemId,
          cartId: dto.cartId,
          quantity,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + HOLD_MS),
          createdBy: SYSTEM_ACTOR_ID,
        },
      });
    });
  }

  async release(id: string) {
    const reservation = await this.prisma.stockReservation.findFirst({
      where: { id, branchId: this.branch.branchId },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }
    if (reservation.status !== 'ACTIVE') {
      throw new ConflictException(
        `Reservation ${id} is ${reservation.status}, not ACTIVE`,
      );
    }

    return this.prisma.stockReservation.update({
      where: { id },
      data: { status: 'RELEASED' },
    });
  }

  async releaseCart(cartId: string) {
    const result = await this.prisma.stockReservation.updateMany({
      where: {
        branchId: this.branch.branchId,
        cartId,
        status: 'ACTIVE',
      },
      data: { status: 'RELEASED' },
    });
    return { released: result.count };
  }

  /** Extend ACTIVE holds for a cart (idle-banner refresh). */
  async touchCart(cartId: string) {
    const result = await this.prisma.stockReservation.updateMany({
      where: {
        branchId: this.branch.branchId,
        cartId,
        status: 'ACTIVE',
      },
      data: { expiresAt: new Date(Date.now() + HOLD_MS) },
    });
    return { refreshed: result.count };
  }

  async listCart(cartId: string) {
    return this.prisma.stockReservation.findMany({
      where: {
        branchId: this.branch.branchId,
        cartId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepExpired() {
    await this.prisma.stockReservation.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }
}
