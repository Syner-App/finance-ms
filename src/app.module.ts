import { Module } from '@nestjs/common';
import { LedgerModule } from './ledger/ledger.module.ts';
import { CatalogModule } from './catalog/catalog.module.ts';
import { SalesModule } from './sales/sales.module.ts';
import { PayablesModule } from './payables/payables.module.ts';
import { CreditsModule } from './credits/credits.module.ts';
import { PlanningModule } from './planning/planning.module.ts';
import { TreasuryModule } from './treasury/treasury.module.ts';

@Module({
  imports: [
    LedgerModule,
    CatalogModule,
    SalesModule,
    PayablesModule,
    CreditsModule,
    PlanningModule,
    TreasuryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
