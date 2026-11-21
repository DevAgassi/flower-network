import { z } from 'zod';

export const loginRequestSchema = z
  .object({
    email: z.email().max(254).meta({ example: 'florist@example.com' }),
    password: z.string().min(1).max(200),
  })
  .meta({ id: 'LoginRequest' });

export const staffUserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
  })
  .meta({ id: 'StaffUser' });

export const loginResponseSchema = z
  .object({
    token: z.string().meta({
      description: 'Send as `Authorization: Bearer <token>`; keep it secret',
    }),
    expiresAt: z.iso.datetime().meta({
      description:
        'When the session ends without further requests; every request extends it',
    }),
    user: staffUserSchema,
  })
  .meta({ id: 'LoginResponse' });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type StaffUser = z.infer<typeof staffUserSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
