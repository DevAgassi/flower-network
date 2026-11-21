import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC, REQUIRED_PERMISSION } from './auth.decorators.js';
import { toAuthenticatedUser } from './authenticated-user.js';
import type { Permission } from './permissions.js';
import { SessionStore } from './session.store.js';
import { UsersService } from './users.service.js';

/** `Authorization: Bearer <token>` → token, or undefined. */
export function bearerToken(request: Request): string | undefined {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard: every route needs a valid session unless marked `@Public()`.
 * Sets `request.user` with the role and locations read from the database on
 * every request, so a role change applies at once. A disabled or deleted
 * user is rejected even if the session still exists; a route with
 * `@RequirePermission()` answers `403` to roles without that permission.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionStore,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(request);
    const session = token ? await this.sessions.resolve(token) : null;
    const member = session
      ? await this.users.findMember(session.userId)
      : undefined;
    if (!token || !member || member.status !== 'active') {
      throw new UnauthorizedException('Sign in required');
    }
    const user = toAuthenticatedUser(member, member.locationIds);
    request.user = user;
    request.sessionToken = token;

    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (required && !user.permissions.includes(required)) {
      throw new ForbiddenException(`Requires the ${required} permission`);
    }
    return true;
  }
}
