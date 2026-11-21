import type { StaffRole, User } from './identity.schema.js';
import {
  isLocationScoped,
  type Permission,
  permissionsOf,
} from './permissions.js';

/** Locations a user may work with: the whole network, or the listed ids. */
export type LocationScope = 'all' | readonly string[];

/** What a request knows about the signed-in staff user. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  permissions: readonly Permission[];
  locations: LocationScope;
}

export function toAuthenticatedUser(
  user: User,
  locationIds: readonly string[],
): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: permissionsOf(user.role),
    locations: isLocationScoped(user.role) ? locationIds : 'all',
  };
}

declare global {
  // Express merges this namespace into its Request type.
  namespace Express {
    interface Request {
      /** Set by AuthGuard on every non-public route. */
      user?: AuthenticatedUser;
      /** The bearer token of the current session (for logout). */
      sessionToken?: string;
    }
  }
}
