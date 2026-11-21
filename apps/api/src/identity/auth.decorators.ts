import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.js';

export const IS_PUBLIC = 'identity:isPublic';

/**
 * Opens a controller or route to requests without a session. Everything else
 * requires `Authorization: Bearer <token>` (AuthGuard is global).
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The signed-in user: `me(@CurrentUser() user: AuthenticatedUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    // Only reachable on a public route by mistake: fail loudly.
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
