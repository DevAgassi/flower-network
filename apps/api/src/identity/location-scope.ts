import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user.js';

/** Owner and admin reach every location; florists and couriers only their own. */
export function canAccessLocation(
  user: AuthenticatedUser,
  locationId: string,
): boolean {
  return user.locations === 'all' || user.locations.includes(locationId);
}

/**
 * Call before reading or changing anything that belongs to a location
 * (stock, cash shift, shipment): `403` when the user is not bound to it.
 */
export function assertLocationAccess(
  user: AuthenticatedUser,
  locationId: string,
): void {
  if (!canAccessLocation(user, locationId)) {
    throw new ForbiddenException('No access to this location');
  }
}
