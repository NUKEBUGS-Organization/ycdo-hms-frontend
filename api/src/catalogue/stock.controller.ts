import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { StockService } from './stock.service';

@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  list(
    @Query('belowMin', new DefaultValuePipe(false), ParseBoolPipe)
    belowMin: boolean,
  ) {
    return this.stockService.listStock(belowMin);
  }

  @Get(':itemId/movements')
  movements(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.stockService.listMovements(itemId, page, limit);
  }
}
