import type { AuthenticatedUser } from './authenticated-user.js';
import { assertLocationAccess, canAccessLocation } from './location-scope.js';
import {
  canManageRole,
  isLocationScoped,
  PERMISSIONS,
  permissionsOf,
} from './permissions.js';

describe('permission matrix', () => {
  it('gives the owner every permission', () => {
    expect(permissionsOf('owner')).toEqual(PERMISSIONS);
  });

  it('lets owner and admin read and manage staff, florist and courier not', () => {
    for (const permission of ['staff:read', 'staff:manage'] as const) {
      expect(permissionsOf('owner')).toContain(permission);
      expect(permissionsOf('admin')).toContain(permission);
      expect(permissionsOf('florist')).not.toContain(permission);
      expect(permissionsOf('courier')).not.toContain(permission);
    }
  });

  it('lets an admin manage only florists and couriers', () => {
    expect(canManageRole('owner', 'owner')).toBe(true);
    expect(canManageRole('owner', 'admin')).toBe(true);
    expect(canManageRole('admin', 'florist')).toBe(true);
    expect(canManageRole('admin', 'courier')).toBe(true);
    expect(canManageRole('admin', 'admin')).toBe(false);
    expect(canManageRole('admin', 'owner')).toBe(false);
    expect(canManageRole('florist', 'courier')).toBe(false);
  });

  it('binds only florists and couriers to locations', () => {
    expect(isLocationScoped('florist')).toBe(true);
    expect(isLocationScoped('courier')).toBe(true);
    expect(isLocationScoped('admin')).toBe(false);
    expect(isLocationScoped('owner')).toBe(false);
  });
});

describe('location scope', () => {
  const shop = '0193a1b2-0000-7000-8000-000000000001';
  const otherShop = '0193a1b2-0000-7000-8000-000000000002';
  const user = (locations: AuthenticatedUser['locations']) =>
    ({ locations }) as AuthenticatedUser;

  it('lets a network-wide user into any location', () => {
    expect(canAccessLocation(user('all'), otherShop)).toBe(true);
  });

  it('lets a florist only into their own locations', () => {
    const florist = user([shop]);

    expect(canAccessLocation(florist, shop)).toBe(true);
    expect(() => assertLocationAccess(florist, otherShop)).toThrow(
      'No access to this location',
    );
  });
});
