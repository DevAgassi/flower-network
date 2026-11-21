import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LocationsService } from '../locations/locations.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { StaffRole } from './identity.schema.js';
import { generatePassword } from './password.js';
import { canManageRole, isLocationScoped } from './permissions.js';
import {
  type StaffMember,
  type StaffMemberChanges,
  UsersService,
} from './users.service.js';

/**
 * Staff management rules on top of UsersService: who may manage whom, what
 * nobody may do to themselves, which roles take locations. Callers already
 * hold `staff:manage` (checked by the guard).
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly users: UsersService,
    private readonly locations: LocationsService,
  ) {}

  list(): Promise<StaffMember[]> {
    return this.users.listMembers();
  }

  async get(id: string): Promise<StaffMember> {
    const member = await this.users.findMember(id);
    if (!member) throw new NotFoundException('Staff member not found');
    return member;
  }

  async create(
    actor: AuthenticatedUser,
    input: {
      email: string;
      name: string;
      role: StaffRole;
      locationIds: string[];
    },
  ): Promise<{ member: StaffMember; password: string }> {
    assertCanManage(actor, input.role);
    assertLocationsFit(input.role, input.locationIds);
    await this.locations.assertActive(input.locationIds);
    if (await this.users.findByEmail(input.email)) {
      throw new ConflictException('A user with this email already exists');
    }
    const password = generatePassword();
    const member = await this.users.create({ ...input, password });
    this.logger.log(
      `Staff member ${member.id} (${member.role}) created by ${actor.id}`,
    );
    return { member, password };
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    changes: StaffMemberChanges,
  ): Promise<StaffMember> {
    const target = await this.get(id);
    if (
      target.id === actor.id &&
      (changes.role !== undefined || changes.status !== undefined)
    ) {
      throw new ForbiddenException('You cannot change your own role or status');
    }
    assertCanManage(actor, target.role);
    if (changes.role) assertCanManage(actor, changes.role);
    if (changes.locationIds) {
      assertLocationsFit(changes.role ?? target.role, changes.locationIds);
      await this.locations.assertActive(changes.locationIds);
    }

    const updated = await this.users.update(id, changes);
    if (!updated) throw new NotFoundException('Staff member not found');
    this.logger.log(
      `Staff member ${id} changed by ${actor.id}: ${Object.keys(changes).join(', ')}`,
    );
    return updated;
  }

  async resetPassword(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<{ password: string }> {
    const target = await this.get(id);
    if (target.id === actor.id) {
      throw new ForbiddenException('You cannot reset your own password here');
    }
    assertCanManage(actor, target.role);
    const password = generatePassword();
    await this.users.setPassword(id, password);
    this.logger.log(`Password of staff member ${id} reset by ${actor.id}`);
    return { password };
  }
}

function assertCanManage(actor: AuthenticatedUser, role: StaffRole): void {
  if (!canManageRole(actor.role, role)) {
    throw new ForbiddenException(
      `The ${actor.role} role cannot manage ${role} users`,
    );
  }
}

function assertLocationsFit(
  role: StaffRole,
  locationIds: readonly string[],
): void {
  if (!isLocationScoped(role) && locationIds.length) {
    throw new BadRequestException(
      `The ${role} role works at every location; locationIds must be empty`,
    );
  }
}
