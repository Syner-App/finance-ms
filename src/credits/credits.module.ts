import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller.ts';
import { CreditsService } from './credits.service.ts';
import { OutboxModule } from '../outbox/outbox.module.ts';

@Module({
  imports: [OutboxModule],
  controllers: [CreditsController],
  providers: [CreditsService],
})
export class CreditsModule {}
