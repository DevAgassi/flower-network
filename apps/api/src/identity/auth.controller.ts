import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { apiErrorSchema } from '../openapi/errors.contract.js';
import { CurrentUser, Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import {
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
  loginResponseSchema,
  type StaffUser,
  staffUserSchema,
} from './identity.contract.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Sign in a staff user and start a session' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    standardSchema: loginResponseSchema,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    standardSchema: apiErrorSchema,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Wrong email or password (the same for both)',
    standardSchema: apiErrorSchema,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description:
      'Too many failed attempts for this email or IP; retry in 15 minutes',
    standardSchema: apiErrorSchema,
  })
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Req() request: Request,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(
      body.email,
      body.password,
      request.ip ?? 'unknown',
    );
    return {
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      user: toStaffUser(result.user),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End the current session' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Session ended' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    standardSchema: apiErrorSchema,
  })
  async logout(@Req() request: Request): Promise<void> {
    if (request.sessionToken) await this.auth.logout(request.sessionToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The signed-in staff user, their role, permissions and locations',
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: staffUserSchema })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    standardSchema: apiErrorSchema,
  })
  me(@CurrentUser() user: AuthenticatedUser): StaffUser {
    return toStaffUser(user);
  }
}

function toStaffUser(user: AuthenticatedUser): StaffUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: [...user.permissions],
    locations: user.locations === 'all' ? 'all' : [...user.locations],
  };
}
