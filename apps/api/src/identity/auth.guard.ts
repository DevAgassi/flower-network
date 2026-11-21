import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from './auth.decorators.js';
import { toAuthenticatedUser } from './authenticated-user.js';
import { SessionStore } from './session.store.js';
import { UsersService } from './users.service.js';

/** `Authorization: Bearer <token>` → token, or undefined. */
export function bearerToken(request: Request): string | undefined {
  const [scheme, token] = (request.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard: every route needs a valid session unless marked `@Public()`.
 * Sets `request.user`; a disabled or deleted user is rejected even if the
 * session still exists.
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
    const user = session
      ? await this.users.findById(session.userId)
      : undefined;
    if (!token || !user || user.status !== 'active') {
      throw new UnauthorizedException('Sign in required');
    }
    request.user = toAuthenticatedUser(user);
    request.sessionToken = token;
    return true;
  }
}
