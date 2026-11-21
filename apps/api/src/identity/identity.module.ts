import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginLimiter } from './login-limiter.js';
import { SessionStore } from './session.store.js';
import { UsersService } from './users.service.js';

/**
 * Staff users, sign-in and sessions (IAM-01). Registers the global AuthGuard:
 * every route of the app requires a session unless marked `@Public()`.
 */
@Module({
  controllers: [AuthController],
  providers: [
    UsersService,
    SessionStore,
    LoginLimiter,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [UsersService],
})
export class IdentityModule {}
