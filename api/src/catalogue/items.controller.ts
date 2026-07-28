import { Controller, Get, Query } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('categoryId') categoryId?: string,
    @Query('patientCategory') patientCategory?: string,
  ) {
    return this.itemsService.search(q ?? '', categoryId, patientCategory);
  }

  @Get('unit-prices')
  unitPrices(
    @Query('ids') ids: string,
    @Query('patientCategory') patientCategory?: string,
  ) {
    return this.itemsService.unitPrices(ids ?? '', patientCategory);
  }
}
