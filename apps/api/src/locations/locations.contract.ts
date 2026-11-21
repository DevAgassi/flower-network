import { z } from 'zod';
import { locationKind, locationStatus } from './locations.schema.js';

export const locationKindSchema = z.enum(locationKind.enumValues).meta({
  id: 'LocationKind',
  description: '`store` sells and hands out pickups; `warehouse` stores stock',
});

export const locationStatusSchema = z.enum(locationStatus.enumValues).meta({
  id: 'LocationStatus',
  description:
    'Archived locations are kept for history and hidden from pickers',
});

const opens = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
  .meta({ example: '09:00' });
const closes = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Use HH:MM or 24:00')
  .meta({ example: '20:00' });

export const openingHoursSchema = z
  .object({
    weekday: z
      .number()
      .int()
      .min(1)
      .max(7)
      .meta({ description: 'ISO weekday: 1 = Monday … 7 = Sunday' }),
    opens,
    closes,
  })
  .refine((h) => h.opens < h.closes, {
    message: 'opens must be earlier than closes',
    path: ['closes'],
  })
  .meta({ id: 'OpeningHours' });

const hoursSchema = z
  .array(openingHoursSchema)
  .max(7)
  .refine(
    (hours) => new Set(hours.map((h) => h.weekday)).size === hours.length,
    'Each weekday at most once',
  )
  .meta({
    description:
      'Weekly schedule in Europe/Kyiv local time. A missing weekday is a day off; 00:00–24:00 is around the clock',
  });

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{5,31}$/, 'Digits, spaces, (), - and a leading +')
  .meta({ example: '+380 44 123 45 67' });

export const locationSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: locationKindSchema,
    status: locationStatusSchema,
    address: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    phone: z.string().nullable(),
    hours: z.array(openingHoursSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Location' });

export const createLocationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: locationKindSchema,
    address: z.string().trim().min(1).max(500),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    phone: phone.optional(),
    hours: hoursSchema.default([]),
  })
  .meta({ id: 'CreateLocationRequest' });

export const updateLocationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: locationKindSchema,
    status: locationStatusSchema,
    address: z.string().trim().min(1).max(500),
    latitude: latitude.nullable(),
    longitude: longitude.nullable(),
    phone: phone.nullable(),
    hours: hoursSchema.meta({ description: 'Replaces the whole week' }),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change')
  .meta({ id: 'UpdateLocationRequest' });

export const locationIdSchema = z.uuid();
export const includeArchivedSchema = z
  .enum(['true', 'false'])
  .optional()
  .meta({ description: 'Also return archived locations (default false)' });

export type OpeningHours = z.infer<typeof openingHoursSchema>;
export type LocationDto = z.infer<typeof locationSchema>;
export type CreateLocationRequest = z.infer<typeof createLocationRequestSchema>;
export type UpdateLocationRequest = z.infer<typeof updateLocationRequestSchema>;
