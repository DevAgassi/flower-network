import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/config/env-files.js';

// Same rules as the app: .env only outside production, validated by the schema.
const env = loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL },
  migrations: {
    schema: 'drizzle',
    table: 'migrations',
  },
  strict: true,
  verbose: true,
});
