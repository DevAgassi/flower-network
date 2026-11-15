import { existsSync } from 'node:fs';
import { z } from 'zod';

/** Default API location for local development. */
const DEVELOPMENT_API_URL = 'http://localhost:3001';

/**
 * .env files read outside production, relative to the app directory
 * (scripts run with cwd = apps/web). Real environment variables always win.
 */
const ENV_FILE_PATHS = ['.env', '../../.env'];

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/** Server-side environment of the web app. Never import this from client code. */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_URL: optional(z.url({ protocol: /^https?$/ })),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.API_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_URL'],
        message: 'is required in production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    API_URL: env.API_URL ?? DEVELOPMENT_API_URL,
  }));

export type ServerEnv = z.output<typeof envSchema>;

function loadServerEnv(): ServerEnv {
  if (process.env.NODE_ENV !== 'production') {
    for (const file of ENV_FILE_PATHS) {
      if (existsSync(file)) process.loadEnvFile(file);
    }
  }
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;
  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}

let cached: ServerEnv | undefined;

/**
 * Validated environment, parsed once. The Nitro plugin
 * src/server-plugins/validate-env.ts calls it at server start.
 */
export function getServerEnv(): ServerEnv {
  cached ??= loadServerEnv();
  return cached;
}
