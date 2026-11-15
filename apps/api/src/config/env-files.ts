import { existsSync } from 'node:fs';
import { parseEnv, type Env } from './env.schema.js';

/**
 * .env files read outside production, relative to the app directory
 * (scripts run with cwd = apps/api): app-specific first, then the repo root
 * file shared with compose.yaml. Real environment variables always win.
 */
export const ENV_FILE_PATHS = ['.env', '../../.env'];

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Loads ENV_FILE_PATHS into process.env (development / test only). */
export function loadEnvFiles(): void {
  if (isProduction()) return;
  for (const file of ENV_FILE_PATHS) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

/**
 * For scripts outside Nest (drizzle-kit, migrations): loads .env files the
 * same way as the app and validates with the same schema.
 */
export function loadEnv(): Env {
  loadEnvFiles();
  return parseEnv(process.env);
}
