import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller.ts';
import { LedgerService } from './ledger.service.ts';
import { OutboxModule } from '../outbox/outbox.module.ts';

// OutboxModule provides the PrismaService instance shared by the feature modules
@Module({
  imports: [OutboxModule],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
