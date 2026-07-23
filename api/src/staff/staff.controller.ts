import { Controller, DefaultValuePipe, Get, ParseBoolPipe, Query } from '@nestjs/common';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  list(
    @Query('doctors', new DefaultValuePipe(false), ParseBoolPipe)
    doctors: boolean,
  ) {
    return this.staffService.list(doctors);
  }
}
