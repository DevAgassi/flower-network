import { z } from 'zod';

/**
 * Body of every error response (Nest's default format): validation (400),
 * authentication (401), rate limits (429) and others.
 */
export const apiErrorSchema = z
  .object({
    statusCode: z.number().int().meta({ example: 401 }),
    message: z
      .union([z.string(), z.array(z.string())])
      .meta({ description: 'One message, or one per problem (validation)' }),
    error: z.string().optional().meta({ example: 'Unauthorized' }),
  })
  .meta({ id: 'ApiError' });
