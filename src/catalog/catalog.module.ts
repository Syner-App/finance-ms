import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.ts';
import { CatalogService } from './catalog.service.ts';
import { OutboxModule } from '../outbox/outbox.module.ts';
import { IntegrationsModule } from '../integrations/integrations.module.ts';

@Module({
  imports: [OutboxModule, IntegrationsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
