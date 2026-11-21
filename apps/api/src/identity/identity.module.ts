import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginLimiter } from './login-limiter.js';
import { SessionStore } from './session.store.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { UsersService } from './users.service.js';

/**
 * Staff users, sign-in and sessions (IAM-01), roles, permissions and
 * location bindings (IAM-02). Registers the global AuthGuard: every route of
 * the app requires a session unless marked `@Public()`, and a permission
 * when marked `@RequirePermission()`.
 */
@Module({
  controllers: [AuthController, StaffController],
  providers: [
    UsersService,
    SessionStore,
    LoginLimiter,
    AuthService,
    StaffService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [UsersService],
})
export class IdentityModule {}
