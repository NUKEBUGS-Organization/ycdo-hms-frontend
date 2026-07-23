import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  async search(q: string, categoryId?: string) {
    const term = q?.trim() ?? '';
    if (!term) {
      throw new BadRequestException('q is required');
    }

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
        purchasePrice: true,
        priceDeserving: true,
        pricePoor: true,
        priceMember: true,
        priceGeneral: true,
        category: { select: { name: true } },
      },
    });

    const available = await this.stock.getAvailable(items.map((i) => i.id));

    return items.map(({ category, ...item }) => ({
      ...item,
      categoryName: category.name,
      available: available.get(item.id) ?? new Prisma.Decimal(0),
    }));
  }
}
