import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { PatientsModule } from '../patients/patients.module';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';

@Module({
  imports: [PatientsModule, CatalogueModule],
  controllers: [TokensController],
  providers: [TokensService],
})
export class TokensModule {}
