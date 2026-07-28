import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PatientCategory, Prisma } from '@prisma/client';
import { BranchConfig } from '../common/config/branch.config';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUnitPrice } from './pricing';
import { StockService } from './stock.service';

const PATIENT_CATEGORIES = new Set<string>(Object.values(PatientCategory));

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly branch: BranchConfig,
  ) {}

  async search(q: string, categoryId?: string, patientCategory?: string) {
    const term = q?.trim() ?? '';
    if (!term) {
      throw new BadRequestException('q is required');
    }

    const category = this.parsePatientCategory(patientCategory);

    const where: Prisma.ItemWhereInput = {
      active: true,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { barcode: { contains: term, mode: 'insensitive' } },
      ],
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const branchId = this.branch.branchId;

    const items = await this.prisma.item.findMany({
      where,
      take: 30,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        barcode: true,
        categoryId: true,
        tracksStock: true,
        category: { select: { name: true } },
        branchPrices: {
          where: { branchId },
          take: 1,
        },
      },
    });

    const available = await this.stock.getAvailable(items.map((i) => i.id));

    return items.map(({ category: cat, branchPrices, ...item }) => {
      const price = branchPrices[0];
      if (!price) {
        throw new BadRequestException(
          `No branch price for item ${item.name} (${item.id}) at this branch`,
        );
      }
      return {
        ...item,
        categoryName: cat.name,
        purchasePrice: price.purchasePrice,
        priceDeserving: price.priceDeserving,
        pricePoor: price.pricePoor,
        priceMember: price.priceMember,
        priceGeneral: price.priceGeneral,
        unitPrice: resolveUnitPrice(price, category),
        available: available.get(item.id) ?? new Prisma.Decimal(0),
      };
    });
  }

  /** Batch-resolve unit prices for cart category changes — server is sole authority. */
  async unitPrices(idsRaw: string, patientCategory?: string) {
    const category = this.parsePatientCategory(patientCategory);
    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      throw new BadRequestException('ids is required');
    }

    const branchId = this.branch.branchId;
    const rows = await this.prisma.branchItemPrice.findMany({
      where: { branchId, itemId: { in: ids } },
    });
    const byItem = new Map(rows.map((r) => [r.itemId, r]));

    return ids.map((itemId) => {
      const price = byItem.get(itemId);
      if (!price) {
        throw new NotFoundException(
          `No branch price for item ${itemId} at this branch`,
        );
      }
      return {
        itemId,
        unitPrice: resolveUnitPrice(price, category),
        purchasePrice: price.purchasePrice,
        priceDeserving: price.priceDeserving,
        pricePoor: price.pricePoor,
        priceMember: price.priceMember,
        priceGeneral: price.priceGeneral,
      };
    });
  }

  private parsePatientCategory(raw?: string): PatientCategory {
    const value = (raw ?? 'GENERAL').trim().toUpperCase();
    if (!PATIENT_CATEGORIES.has(value)) {
      throw new BadRequestException(
        `patientCategory must be one of ${[...PATIENT_CATEGORIES].join(', ')}`,
      );
    }
    return value as PatientCategory;
  }
}
