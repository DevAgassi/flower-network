import { Controller, Get, Inject, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { HealthCheckStatus, HealthResponse } from '@flower/shared';
import { DATABASE, type Database } from '../database/database.module.js';

/**
 * Liveness and dependency checks. Returns 503 with the same body when any
 * check is down, so load balancers and orchestrators can react.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const checks = { database: await this.checkDatabase() };
    const healthy = Object.values(checks).every((c) => c === 'up');
    res.status(healthy ? 200 : 503);
    return {
      status: healthy ? 'ok' : 'error',
      service: 'api',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase(): Promise<HealthCheckStatus> {
    try {
      await this.db.execute(sql`select 1`);
      return 'up';
    } catch {
      return 'down';
    }
  }
}
