import { z } from 'zod';

/** Matches the PostgreSQL service in compose.yaml (development only). */
export const DEVELOPMENT_DATABASE_URL =
  'postgres://flower:flower@localhost:5433/flower';

/** OTLP/HTTP endpoint of Jaeger in compose.yaml (development only). */
export const DEVELOPMENT_OTLP_ENDPOINT = 'http://localhost:4318';

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

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
    // 'off' on API-only instances when separate worker processes publish
    // outbox messages; the worker itself refuses to start with 'off'.
    OUTBOX_RELAY: optional(z.enum(['on', 'off'])).transform((v) => v ?? 'on'),
    // Default depends on the mode: 'silent' under Vitest, otherwise 'info'.
    LOG_LEVEL: optional(z.enum(LOG_LEVELS)),
    // Where traces are sent (OTLP/HTTP). Not set outside development = tracing off.
    OTEL_EXPORTER_OTLP_ENDPOINT: optional(z.url({ protocol: /^https?$/ })),
    // Port of the worker's /metrics server (the API serves /metrics on PORT).
    METRICS_PORT: optional(z.coerce.number().int().min(1).max(65535)).transform(
      (v) => v ?? 9464,
    ),
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
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
    OTEL_EXPORTER_OTLP_ENDPOINT:
      env.OTEL_EXPORTER_OTLP_ENDPOINT ??
      (env.NODE_ENV === 'development' ? DEVELOPMENT_OTLP_ENDPOINT : undefined),
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
