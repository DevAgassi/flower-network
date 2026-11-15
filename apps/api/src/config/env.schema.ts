import { z } from 'zod';

/** Matches the PostgreSQL service in compose.yaml (development only). */
export const DEVELOPMENT_DATABASE_URL =
  'postgres://flower:flower@localhost:5433/flower';

/** Empty values (`FOO=` in .env) count as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

/**
 * Environment of the API. Every variable the app reads is declared here;
 * the app does not start when validation fails.
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: optional(z.coerce.number().int().min(1).max(65535)).transform(
      (v) => v ?? 3001,
    ),
    DATABASE_URL: optional(z.url({ protocol: /^postgres(ql)?$/ })),
    DATABASE_POOL_MAX: optional(
      z.coerce.number().int().min(1).max(100),
    ).transform((v) => v ?? 10),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'is required in production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    DATABASE_URL: env.DATABASE_URL ?? DEVELOPMENT_DATABASE_URL,
  }));

export type Env = z.output<typeof envSchema>;

/** Validates raw variables; throws one error listing every problem. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${problems}`);
}
