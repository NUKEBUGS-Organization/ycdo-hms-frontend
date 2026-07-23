import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BranchConfig {
  readonly branchId: string;
  readonly branchCode: string;

  constructor(config: ConfigService) {
    const branchId = config.get<string>('BRANCH_ID');
    const branchCode = config.get<string>('BRANCH_CODE');

    if (!branchId || !branchCode) {
      throw new Error(
        'BRANCH_ID and BRANCH_CODE must be set in the environment',
      );
    }

    this.branchId = branchId;
    this.branchCode = branchCode;
  }
}
