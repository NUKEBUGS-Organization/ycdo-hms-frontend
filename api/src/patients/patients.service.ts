import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchConfig } from '../common/config/branch.config';
import { SYSTEM_ACTOR_ID } from '../common/constants';
import { pktDateOnly } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchConfig,
  ) {}

  async create(dto: CreatePatientDto) {
    return this.prisma.$transaction((tx) => this.createWithTx(tx, dto));
  }

  /** Create patient inside an existing transaction (same mrNo locking). */
  async createWithTx(tx: Prisma.TransactionClient, dto: CreatePatientDto) {
    const branchId = this.branch.branchId;
    const branchCode = this.branch.branchCode;

    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM branches WHERE id = ${branchId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundException('Branch not found');
    }

    const latest = await tx.$queryRaw<{ mrNo: string }[]>`
      SELECT "mrNo" FROM patients
      WHERE "branchId" = ${branchId}::uuid
      ORDER BY "mrNo" DESC
      LIMIT 1
      FOR UPDATE
    `;

    let nextSeq = 1;
    if (latest[0]) {
      const seqPart = latest[0].mrNo.split('-').pop() ?? '';
      const parsed = parseInt(seqPart, 10);
      if (Number.isNaN(parsed)) {
        throw new BadRequestException(`Corrupt mrNo: ${latest[0].mrNo}`);
      }
      nextSeq = parsed + 1;
    }

    const mrNo = `${branchCode}-${String(nextSeq).padStart(5, '0')}`;

    return tx.patient.create({
      data: {
        branchId,
        mrNo,
        name: dto.name,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth
          ? pktDateOnly(dto.dateOfBirth)
          : undefined,
        ageYears: dto.ageYears,
        phone: dto.phone,
        cnic: dto.cnic,
        address: dto.address,
        guardianName: dto.guardianName,
        guardianPhone: dto.guardianPhone,
        createdBy: SYSTEM_ACTOR_ID,
      },
    });
  }

  async list(opts: { q: string; page: number; limit: number }) {
    const take = Math.min(Math.max(opts.limit, 1), 100);
    const page = Math.max(opts.page, 1);
    const skip = (page - 1) * take;
    const term = opts.q.trim();

    const where: Prisma.PatientWhereInput = {
      branchId: this.branch.branchId,
    };

    if (term) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { cnic: { contains: term } },
        { mrNo: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          branchId: true,
          mrNo: true,
          name: true,
          gender: true,
          dateOfBirth: true,
          ageYears: true,
          phone: true,
          cnic: true,
          address: true,
          guardianName: true,
          guardianPhone: true,
          linkedPatientId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      total,
      page,
      limit: take,
      data,
    };
  }

  async search(q: string) {
    const term = q.trim();
    if (!term) {
      throw new BadRequestException('q is required');
    }

    return this.prisma.patient.findMany({
      where: {
        branchId: this.branch.branchId,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { phone: term },
          { cnic: term },
          { mrNo: term },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, branchId: this.branch.branchId },
      include: {
        tokens: {
          orderBy: [{ tokenDate: 'desc' }, { createdAt: 'desc' }],
          select: {
            tokenDate: true,
            tokenNo: true,
            status: true,
            tokenType: true,
            category: true,
            createdAt: true,
            doctor: { select: { fullName: true } },
            lines: {
              select: {
                quantity: true,
                dose: true,
                feed: true,
                days: true,
                fixDose: true,
                item: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient ${id} not found`);
    }

    const { tokens, ...rest } = patient;
    return {
      ...rest,
      tokens: tokens.map((t) => ({
        tokenDate: t.tokenDate,
        tokenNo: t.tokenNo,
        tokenType: t.tokenType,
        category: t.category,
        doctorName: t.doctor.fullName,
        status: t.status,
        createdAt: t.createdAt,
        lines: t.lines.map((l) => ({
          itemName: l.item.name,
          quantity: l.quantity,
          dose: l.dose,
          feed: l.feed,
          days: l.days,
          fixDose: l.fixDose,
        })),
      })),
    };
  }

  async update(id: string, dto: UpdatePatientDto) {
    if ('mrNo' in dto || 'branchId' in dto) {
      throw new BadRequestException('mrNo and branchId are immutable');
    }

    const existing = await this.prisma.patient.findFirst({
      where: { id, branchId: this.branch.branchId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Patient ${id} not found`);
    }

    const data: Prisma.PatientUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth
        ? pktDateOnly(dto.dateOfBirth)
        : null;
    }
    if (dto.ageYears !== undefined) data.ageYears = dto.ageYears;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.cnic !== undefined) data.cnic = dto.cnic;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.guardianName !== undefined) data.guardianName = dto.guardianName;
    if (dto.guardianPhone !== undefined) data.guardianPhone = dto.guardianPhone;

    return this.prisma.patient.update({
      where: { id },
      data,
    });
  }
}
