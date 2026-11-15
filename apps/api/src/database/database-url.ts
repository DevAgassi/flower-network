/** Matches the PostgreSQL service in compose.yaml (development only). */
const DEVELOPMENT_DATABASE_URL =
  'postgres://flower:flower@localhost:5433/flower';

/**
 * Returns DATABASE_URL. Outside production a local default is used so that
 * `pnpm infra:up && pnpm dev` works without configuration; in production a
 * missing value is a startup error rather than a silent localhost connection.
 */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (url) return url;
  if (env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production');
  }
  return DEVELOPMENT_DATABASE_URL;
}
