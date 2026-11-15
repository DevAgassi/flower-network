import { defineConfig } from 'drizzle-kit';
import { databaseUrl } from './src/database/database-url.js';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrl() },
  migrations: {
    schema: 'drizzle',
    table: 'migrations',
  },
  strict: true,
  verbose: true,
});
