import { z } from 'zod';
import { userStatus } from './identity.schema.js';
import { PERMISSIONS, STAFF_ROLES } from './permissions.js';

export const staffRoleSchema = z
  .enum(STAFF_ROLES)
  .meta({ id: 'StaffRole', description: 'What a staff member does' });

export const staffStatusSchema = z
  .enum(userStatus.enumValues)
  .meta({ id: 'StaffStatus', description: 'A disabled user cannot sign in' });

export const permissionSchema = z.enum(PERMISSIONS).meta({ id: 'Permission' });

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
    role: staffRoleSchema,
    permissions: z.array(permissionSchema).meta({
      description: 'What the role allows; build navigation from it',
    }),
    locations: z.union([z.literal('all'), z.array(z.uuid())]).meta({
      description:
        "`all` for owner and admin; a florist's or courier's location ids",
    }),
  })
  .meta({ id: 'StaffUser', description: 'The signed-in staff user' });

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

const nameSchema = z.string().trim().min(1).max(200);
const locationIdsSchema = z.array(z.uuid()).max(100).meta({
  description:
    'Locations a florist or courier works at; must be empty for owner and admin',
});

export const staffMemberSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    role: staffRoleSchema,
    status: staffStatusSchema,
    locationIds: z.array(z.uuid()),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'StaffMember' });

export const staffIdSchema = z.uuid();

export const createStaffRequestSchema = z
  .object({
    email: z.email().max(254),
    name: nameSchema,
    role: staffRoleSchema,
    locationIds: locationIdsSchema.default([]),
  })
  .meta({ id: 'CreateStaffRequest' });

export const createStaffResponseSchema = z
  .object({
    member: staffMemberSchema,
    password: z.string().meta({
      description: 'Generated password, shown only in this response',
    }),
  })
  .meta({ id: 'CreateStaffResponse' });

export const updateStaffRequestSchema = z
  .object({
    name: nameSchema,
    role: staffRoleSchema,
    status: staffStatusSchema,
    locationIds: locationIdsSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change')
  .meta({ id: 'UpdateStaffRequest' });

export const passwordResetResponseSchema = z
  .object({
    password: z.string().meta({
      description:
        'New generated password, shown only in this response; all sessions of the user ended',
    }),
  })
  .meta({ id: 'PasswordResetResponse' });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type StaffUser = z.infer<typeof staffUserSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type StaffMemberDto = z.infer<typeof staffMemberSchema>;
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;
export type CreateStaffResponse = z.infer<typeof createStaffResponseSchema>;
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>;
export type PasswordResetResponse = z.infer<typeof passwordResetResponseSchema>;
