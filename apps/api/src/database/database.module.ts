import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AppConfigService } from '../config/app-config.module.js';

/** Injection token for the Drizzle database instance. */
export const DATABASE = Symbol('DATABASE');
const PG_POOL = Symbol('PG_POOL');

export type Database = NodePgDatabase;

const logger = new Logger('Database');

export function createPool(connectionString: string, max: number): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  // Idle clients receive an error when PostgreSQL restarts or drops the
  // connection. Without a listener pg re-emits it as an unhandled 'error'
  // event and the whole process crashes; the pool replaces the client itself.
  pool.on('error', (err) => {
    logger.warn(`Idle PostgreSQL connection error: ${err.message}`);
  });
  return pool;
}

/**
 * Provides a shared connection pool and the Drizzle instance:
 * `constructor(@Inject(DATABASE) private readonly db: Database) {}`.
 * The pool connects lazily, so the app starts even if PostgreSQL is down;
 * GET /health reports it.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        createPool(
          config.get('DATABASE_URL', { infer: true }),
          config.get('DATABASE_POOL_MAX', { infer: true }),
        ),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Database => drizzle({ client: pool }),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
