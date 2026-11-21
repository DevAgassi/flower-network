import { type StaffRole, staffRole } from './identity.schema.js';

export const STAFF_ROLES = staffRole.enumValues;

/**
 * Every permission in the system, `<area>:<action>`. A module adds its own
 * here when it is built, together with the matrix rows below; routes require
 * permissions, never roles (`@RequirePermission()`).
 */
export const PERMISSIONS = ['staff:read', 'staff:manage'] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Who can do what. The owner can do everything. */
const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: ['staff:read', 'staff:manage'],
  florist: [],
  courier: [],
};

/**
 * Roles whose users a role may create, change, disable or reset passwords
 * for. An admin cannot touch admins or the owner, so cannot promote
 * themselves or lock the owner out.
 */
const MANAGEABLE_ROLES: Record<StaffRole, readonly StaffRole[]> = {
  owner: STAFF_ROLES,
  admin: ['florist', 'courier'],
  florist: [],
  courier: [],
};

/** Roles bound to specific locations (`staff_locations`); others work everywhere. */
const LOCATION_SCOPED_ROLES: readonly StaffRole[] = ['florist', 'courier'];

export function permissionsOf(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function canManageRole(actor: StaffRole, target: StaffRole): boolean {
  return MANAGEABLE_ROLES[actor].includes(target);
}

export function isLocationScoped(role: StaffRole): boolean {
  return LOCATION_SCOPED_ROLES.includes(role);
}
