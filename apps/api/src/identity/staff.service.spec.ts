import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { LocationsService } from '../locations/locations.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { StaffRole } from './identity.schema.js';
import { StaffService } from './staff.service.js';
import type { StaffMember, UsersService } from './users.service.js';

const SHOP = '0193a1b2-0000-7000-8000-000000000001';

function actor(role: StaffRole, id = `${role}-id`): AuthenticatedUser {
  return {
    id,
    email: `${role}@example.com`,
    name: role,
    role,
    permissions: [],
    locations: 'all',
  };
}

function member(role: StaffRole, id = `${role}-target`): StaffMember {
  return { id, role, status: 'active', locationIds: [] } as never;
}

describe('StaffService rules', () => {
  const users = {
    findByEmail: vi.fn(),
    findMember: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setPassword: vi.fn(),
  };
  const locations = { assertActive: vi.fn() };
  const service = new StaffService(
    users as unknown as UsersService,
    locations as unknown as LocationsService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    users.create.mockImplementation((input: { role: StaffRole }) =>
      member(input.role),
    );
    users.update.mockImplementation((id: string) => member('florist', id));
  });

  it('lets an admin create a florist bound to a shop', async () => {
    const result = await service.create(actor('admin'), {
      email: 'new@example.com',
      name: 'New Florist',
      role: 'florist',
      locationIds: [SHOP],
    });

    expect(result.password).toMatch(/^[\w-]{16}$/);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'florist', locationIds: [SHOP] }),
    );
  });

  it('rejects unknown or archived locations', async () => {
    locations.assertActive.mockRejectedValue(
      new BadRequestException('Unknown or archived locations: x'),
    );

    await expect(
      service.create(actor('admin'), {
        email: 'new@example.com',
        name: 'New Florist',
        role: 'florist',
        locationIds: [SHOP],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('forbids an admin to create an admin or an owner', async () => {
    for (const role of ['admin', 'owner'] as const) {
      await expect(
        service.create(actor('admin'), {
          email: 'x@example.com',
          name: 'X',
          role,
          locationIds: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects locations for network-wide roles', async () => {
    await expect(
      service.create(actor('owner'), {
        email: 'x@example.com',
        name: 'X',
        role: 'admin',
        locationIds: [SHOP],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a taken email', async () => {
    users.findByEmail.mockResolvedValue(member('florist'));

    await expect(
      service.create(actor('owner'), {
        email: 'taken@example.com',
        name: 'X',
        role: 'florist',
        locationIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forbids changing your own role or status, but not your name', async () => {
    const owner = actor('owner');
    users.findMember.mockResolvedValue(member('owner', owner.id));

    await expect(
      service.update(owner, owner.id, { role: 'admin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(owner, owner.id, { status: 'disabled' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.update(owner, owner.id, { name: 'New Name' });
    expect(users.update).toHaveBeenCalledTimes(1);
  });

  it('forbids an admin to change an admin, or promote a florist to admin', async () => {
    users.findMember.mockResolvedValueOnce(member('admin'));
    await expect(
      service.update(actor('admin'), 'admin-target', { name: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    users.findMember.mockResolvedValueOnce(member('florist'));
    await expect(
      service.update(actor('admin'), 'florist-target', { role: 'admin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('checks locations against the new role', async () => {
    users.findMember.mockResolvedValue(member('admin'));

    await expect(
      service.update(actor('owner'), 'admin-target', {
        role: 'florist',
        locationIds: [SHOP],
      }),
    ).resolves.toBeDefined();
    await expect(
      service.update(actor('owner'), 'admin-target', { locationIds: [SHOP] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resets the password of a managed user, not your own', async () => {
    users.findMember.mockResolvedValueOnce(member('courier'));
    const { password } = await service.resetPassword(
      actor('admin'),
      'courier-target',
    );
    expect(users.setPassword).toHaveBeenCalledWith('courier-target', password);

    const admin = actor('admin');
    users.findMember.mockResolvedValueOnce(member('admin', admin.id));
    await expect(service.resetPassword(admin, admin.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
