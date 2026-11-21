import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { AppOutboxModule } from './outbox/outbox.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    AppConfigModule,
    ObservabilityModule,
    DatabaseModule,
    RedisModule,
    ScheduleModule.forRoot(),
    AppOutboxModule.register(),
    HealthModule,
    IdentityModule,
  ],
  providers: [
    // Validates every parameter declared with a zod schema, e.g.
    // `@Body({ schema: createOrderSchema })`; invalid input → 400.
    { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
  ],
})
export class AppModule {}
