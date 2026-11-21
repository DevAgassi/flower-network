import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.module.js';

/** Injection token for the shared Redis client: `@Inject(REDIS) redis: Redis`. */
export const REDIS = Symbol('REDIS');

const logger = new Logger('Redis');

export function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    // Fail commands fast while Redis is down instead of queueing them
    // forever; the client keeps reconnecting in the background.
    maxRetriesPerRequest: 2,
    connectionName: 'flower-api',
  });
  // Without a listener a dropped connection is an unhandled 'error' event and
  // crashes the process (same rule as the pg pool, see the platform journal).
  client.on('error', (err) => {
    logger.warn(`Redis connection error: ${err.message}`);
  });
  return client;
}

/**
 * One Redis connection per process (sessions, login limits; later BullMQ
 * needs its own connections). Global: inject `REDIS` anywhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        createRedisClient(config.get('REDIS_URL', { infer: true })),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'end') return;
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
