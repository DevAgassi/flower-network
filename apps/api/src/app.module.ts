import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { AppOutboxModule } from './outbox/outbox.module.js';

@Module({
  imports: [
    AppConfigModule,
    ObservabilityModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    AppOutboxModule.register(),
    HealthModule,
  ],
})
export class AppModule {}
