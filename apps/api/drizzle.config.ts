import { defineConfig } from 'drizzle-kit';
import { loadEnvFiles } from './src/config/env-files.js';
import { parseEnv } from './src/config/env.schema.js';

// Same rules as the app: .env only outside production, validated by the schema.
loadEnvFiles();
const env = parseEnv(process.env);

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
