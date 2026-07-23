import { Global, Module } from '@nestjs/common';
import { BranchConfig } from './config/branch.config';

@Global()
@Module({
  providers: [BranchConfig],
  exports: [BranchConfig],
})
export class CommonModule {}
