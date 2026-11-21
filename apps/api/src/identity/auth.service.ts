import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type AuthenticatedUser,
  toAuthenticatedUser,
} from './authenticated-user.js';
import { LoginLimiter } from './login-limiter.js';
import { verifyAgainstDummy, verifyPassword } from './password.js';
import { SessionStore } from './session.store.js';
import { normalizeEmail, UsersService } from './users.service.js';

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionStore,
    private readonly limiter: LoginLimiter,
  ) {}

  /**
   * Unknown email, wrong password and disabled user all fail the same way
   * and take the same time, so a caller cannot tell which emails exist.
   */
  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<LoginResult> {
    const normalized = normalizeEmail(email);
    await this.limiter.assertAllowed(normalized, ip);

    const user = await this.users.findByEmail(normalized);
    const valid =
      user && user.status === 'active'
        ? await verifyPassword(password, user.passwordHash)
        : await verifyAgainstDummy(password);
    if (!user || !valid) {
      await this.limiter.recordFailure(normalized, ip);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.limiter.reset(normalized);
    const session = await this.sessions.create(user.id);
    await this.users.recordLogin(user.id);
    const member = await this.users.findMember(user.id);
    return {
      ...session,
      user: toAuthenticatedUser(user, member?.locationIds ?? []),
    };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }
}
