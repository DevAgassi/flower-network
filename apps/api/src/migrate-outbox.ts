import { fromPg, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import pg from 'pg';
import { runOrExit } from './bootstrap.js';
import { loadEnv } from './config/env-files.js';
import { OUTBOX_SCHEMA } from './outbox/outbox.module.js';

/**
 * Applies the outbox schema migrations (part of `pnpm db:migrate`). In
 * production the app refuses to start with an outdated outbox schema, so this
 * runs before a new version is deployed, next to `drizzle-kit migrate`.
 */
await runOrExit(async () => {
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const store = new PostgresOutboxStore({
      executor: fromPg(pool),
      schema: OUTBOX_SCHEMA,
      migrate: false,
    });
    const applied = await store.migrate();
    console.log(
      applied.length
        ? `Outbox schema "${OUTBOX_SCHEMA}": applied migrations ${applied.join(', ')}`
        : `Outbox schema "${OUTBOX_SCHEMA}": up to date`,
    );
  } finally {
    await pool.end();
  }
});
