import { Controller, Get, Query } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('category') category?: string,
  ) {
    return this.itemsService.search(q ?? '', category);
  }
}
