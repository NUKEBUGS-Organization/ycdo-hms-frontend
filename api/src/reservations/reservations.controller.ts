import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto) {
    return this.reservationsService.create(dto);
  }

  @Get('cart/:cartId')
  listCart(@Param('cartId', ParseUUIDPipe) cartId: string) {
    return this.reservationsService.listCart(cartId);
  }

  @Delete('cart/:cartId')
  releaseCart(@Param('cartId', ParseUUIDPipe) cartId: string) {
    return this.reservationsService.releaseCart(cartId);
  }

  @Post('cart/:cartId/touch')
  touchCart(@Param('cartId', ParseUUIDPipe) cartId: string) {
    return this.reservationsService.touchCart(cartId);
  }

  @Delete(':id')
  release(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.release(id);
  }
}
