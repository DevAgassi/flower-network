import { Controller, Get, Inject, Res } from '@nestjs/common';
import { OutboxRelay } from '@nestjs/outbox';
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
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outboxRelay: OutboxRelay,
  ) {}

  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const [database, outbox] = await Promise.all([
      this.probe(() => this.db.execute(sql`select 1`)),
      // Reads the outbox tables: fails when the store or its schema is unusable.
      this.probe(() => this.outboxRelay.stats()),
    ]);
    const checks = { database, outbox };
    const healthy = Object.values(checks).every((c) => c === 'up');
    res.status(healthy ? 200 : 503);
    return {
      status: healthy ? 'ok' : 'error',
      service: 'api',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async probe(
    check: () => Promise<unknown>,
  ): Promise<HealthCheckStatus> {
    try {
      await check();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
