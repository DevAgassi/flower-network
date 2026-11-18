import { z } from 'zod';

/** Result of a single dependency check. */
export const healthCheckStatusSchema = z.enum(['up', 'down']);

/**
 * Body of GET /health: 200 when every check is up, 503 with the same shape
 * otherwise. `id` names the schema in openapi.json (components.schemas).
 */
export const healthResponseSchema = z
  .object({
    status: z.enum(['ok', 'error']),
    service: z
      .string()
      .meta({ description: 'App that answered', example: 'api' }),
    timestamp: z.iso.datetime().meta({ description: 'Time of the response' }),
    checks: z.record(z.string(), healthCheckStatusSchema).meta({
      description: 'Dependency checks by name',
      example: { database: 'up', outbox: 'up' },
    }),
  })
  .meta({ id: 'HealthResponse' });

export type HealthCheckStatus = z.infer<typeof healthCheckStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
