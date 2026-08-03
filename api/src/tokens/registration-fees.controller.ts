import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { PatientCategory } from '@prisma/client';
import { BranchConfig } from '../common/config/branch.config';
import { PrismaService } from '../prisma/prisma.service';

@Controller('registration-fees')
export class RegistrationFeesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchConfig,
  ) {}

  /** Fees for this branch. Optional ?category= filters to one row. */
  @Get()
  async list(@Query('category') category?: string) {
    const branchId = this.branch.branchId;

    if (category) {
      if (
        !Object.values(PatientCategory).includes(category as PatientCategory)
      ) {
        throw new BadRequestException(`Unknown category ${category}`);
      }
      const cat = category as PatientCategory;
      const fee = await this.prisma.registrationFee.findUnique({
        where: { branchId_category: { branchId, category: cat } },
      });
      if (!fee) {
        throw new NotFoundException(
          `No registration fee for category ${cat} at this branch`,
        );
      }
      return fee;
    }

    return this.prisma.registrationFee.findMany({
      where: { branchId },
      orderBy: { category: 'asc' },
    });
  }
}
