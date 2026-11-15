import { existsSync } from 'node:fs';

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
