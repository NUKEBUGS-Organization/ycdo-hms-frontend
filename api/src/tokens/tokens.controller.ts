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
import { CreateTokenDto } from './dto/create-token.dto';
import { ReturnTokenDto } from './dto/return-token.dto';
import { TokensService } from './tokens.service';

@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Post()
  create(@Body() dto: CreateTokenDto) {
    return this.tokensService.create(dto);
  }

  @Get()
  list(
    @Query('date') date?: string,
    @Query('patientId') patientId?: string,
    @Query('doctorId') doctorId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.tokensService.list({
      date,
      patientId,
      doctorId,
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
}
