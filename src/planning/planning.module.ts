import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller.ts';
import { PlanningService } from './planning.service.ts';
import { OutboxModule } from '../outbox/outbox.module.ts';

@Module({
  imports: [OutboxModule],
  controllers: [PlanningController],
  providers: [PlanningService],
})
export class PlanningModule {}
