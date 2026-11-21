import type { User } from './identity.schema.js';

/** What a request knows about the signed-in staff user. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export function toAuthenticatedUser(user: User): AuthenticatedUser {
  return { id: user.id, email: user.email, name: user.name };
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
