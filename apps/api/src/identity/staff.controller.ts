import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { apiErrorSchema } from '../openapi/errors.contract.js';
import { CurrentUser, RequirePermission } from './auth.decorators.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import {
  type CreateStaffRequest,
  createStaffRequestSchema,
  type CreateStaffResponse,
  createStaffResponseSchema,
  type PasswordResetResponse,
  passwordResetResponseSchema,
  staffIdSchema,
  type StaffMemberDto,
  staffMemberSchema,
  type UpdateStaffRequest,
  updateStaffRequestSchema,
} from './identity.contract.js';
import { StaffService } from './staff.service.js';
import type { StaffMember } from './users.service.js';

const notFound = {
  status: HttpStatus.NOT_FOUND,
  standardSchema: apiErrorSchema,
} as const;
const badRequest = {
  status: HttpStatus.BAD_REQUEST,
  standardSchema: apiErrorSchema,
} as const;

/** Staff management for the owner and admins (ADM-01 builds the screens). */
@ApiTags('staff')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermission('staff:read')
  @ApiOperation({ summary: 'All staff members' })
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: staffMemberSchema.array(),
  })
  async list(): Promise<StaffMemberDto[]> {
    return (await this.staff.list()).map(toDto);
  }

  @Get(':id')
  @RequirePermission('staff:read')
  @ApiOperation({ summary: 'One staff member' })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: staffMemberSchema })
  @ApiResponse(badRequest)
  @ApiResponse(notFound)
  async get(
    @Param('id', { schema: staffIdSchema }) id: string,
  ): Promise<StaffMemberDto> {
    return toDto(await this.staff.get(id));
  }

  @Post()
  @RequirePermission('staff:manage')
  @ApiOperation({
    summary: 'Create a staff member with a generated password',
    description:
      'An admin may create only florists and couriers. The password is returned once.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    standardSchema: createStaffResponseSchema,
  })
  @ApiResponse(badRequest)
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already taken',
    standardSchema: apiErrorSchema,
  })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body({ schema: createStaffRequestSchema }) body: CreateStaffRequest,
  ): Promise<CreateStaffResponse> {
    const { member, password } = await this.staff.create(actor, body);
    return { member: toDto(member), password };
  }

  @Patch(':id')
  @RequirePermission('staff:manage')
  @ApiOperation({
    summary: 'Change name, role, status or locations',
    description:
      'Nobody changes their own role or status; an admin manages only florists and couriers. Disabling ends all sessions.',
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: staffMemberSchema })
  @ApiResponse(badRequest)
  @ApiResponse(notFound)
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Would leave the network without an active owner',
    standardSchema: apiErrorSchema,
  })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', { schema: staffIdSchema }) id: string,
    @Body({ schema: updateStaffRequestSchema }) body: UpdateStaffRequest,
  ): Promise<StaffMemberDto> {
    return toDto(await this.staff.update(actor, id, body));
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staff:manage')
  @ApiOperation({
    summary: "Reset a staff member's password",
    description: 'Generates a new password and ends all sessions of the user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    standardSchema: passwordResetResponseSchema,
  })
  @ApiResponse(badRequest)
  @ApiResponse(notFound)
  resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', { schema: staffIdSchema }) id: string,
  ): Promise<PasswordResetResponse> {
    return this.staff.resetPassword(actor, id);
  }
}

function toDto(member: StaffMember): StaffMemberDto {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    role: member.role,
    status: member.status,
    locationIds: member.locationIds,
    lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}
