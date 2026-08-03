import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApplyRefundFlagDto } from './dto/apply-refund-flag.dto';
import { CreateLabTokenDto } from './dto/create-lab-token.dto';
import { CreateRegistrationTokenDto } from './dto/create-registration-token.dto';
import { CreateTokenDto } from './dto/create-token.dto';
import { ReturnTokenDto } from './dto/return-token.dto';
import { TokensService } from './tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Post('registration')
  createRegistration(@Body() dto: CreateRegistrationTokenDto) {
    return this.tokensService.createRegistration(dto);
  }

  @Post('lab')
  createLab(@Body() dto: CreateLabTokenDto) {
    return this.tokensService.createLab(dto);
  }

  @Post()
  create(@Body() dto: CreateTokenDto) {
    return this.tokensService.create(dto);
  }

  @Get()
  list(
    @Query('date') date?: string,
    @Query('patientId') patientId?: string,
    @Query('doctorId') doctorId?: string,
    @Query('tokenNo') tokenNo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const parsedNo =
      tokenNo != null && tokenNo !== ''
        ? Number.parseInt(tokenNo, 10)
        : undefined;
    return this.tokensService.list({
      date,
      patientId,
      doctorId,
      tokenNo:
        parsedNo != null && Number.isFinite(parsedNo) ? parsedNo : undefined,
      page: page ?? 1,
      limit: limit ?? 50,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tokensService.findOne(id);
  }

  @Post(':id/return')
  returnToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnTokenDto,
  ) {
    return this.tokensService.returnToken(id, dto);
  }

  /**
   * TEMPORARY test entry point — remove or guard once inbound sync exists.
   * Production path will call TokensService.applyRefundFlag from the sync handler.
   */
  @Post(':id/apply-refund-flag')
  applyRefundFlag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyRefundFlagDto,
  ) {
    return this.tokensService.applyRefundFlag(id, dto.flaggedBy, dto.reason);
  }
}
