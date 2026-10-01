import { Module } from '@nestjs/common';
import { TreasuryController } from './treasury.controller.ts';
import { TreasuryService } from './treasury.service.ts';
import { OutboxModule } from '../outbox/outbox.module.ts';
import { IntegrationsModule } from '../integrations/integrations.module.ts';

@Module({
  imports: [OutboxModule, IntegrationsModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
})
export class TreasuryModule {}
