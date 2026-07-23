import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list(doctorsOnly = false) {
    return this.prisma.staff.findMany({
      where: {
        active: true,
        ...(doctorsOnly ? { isDoctor: true } : {}),
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        designation: true,
        isDoctor: true,
      },
    });
  }
}
