import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@flower/shared';

/**
 * Liveness endpoint. Dependency checks (PostgreSQL, Redis) are added
 * together with those dependencies.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }
}
