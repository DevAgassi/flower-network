import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtension, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { apiErrorSchema } from '../openapi/errors.contract.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { Permission } from './permissions.js';

export const IS_PUBLIC = 'identity:isPublic';
export const REQUIRED_PERMISSION = 'identity:requiredPermission';

/**
 * Opens a controller or route to requests without a session. Everything else
 * requires `Authorization: Bearer <token>` (AuthGuard is global).
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Allows a route only to users whose role has the permission (`403`
 * otherwise). Also documents it: bearer auth, `401`, `403` and
 * `x-required-permission` in openapi.json.
 */
export const RequirePermission = (permission: Permission) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSION, permission),
    ApiBearerAuth(),
    ApiExtension('x-required-permission', permission),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      standardSchema: apiErrorSchema,
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: `Requires the \`${permission}\` permission`,
      standardSchema: apiErrorSchema,
    }),
  );

/** The signed-in user: `me(@CurrentUser() user: AuthenticatedUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    // Only reachable on a public route by mistake: fail loudly.
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
