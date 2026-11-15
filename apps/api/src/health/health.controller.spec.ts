import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { DATABASE } from '../database/database.module.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const execute = vi.fn();
  const status = vi.fn();
  const res = { status } as unknown as Response;
  let controller: HealthController;

  beforeEach(async () => {
    execute.mockReset();
    status.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DATABASE, useValue: { execute } }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('reports ok with 200 when the database answers', async () => {
    execute.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const result = await controller.check(res);

    expect(status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({
      status: 'ok',
      service: 'api',
      checks: { database: 'up' },
    });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('reports error with 503 when the database is unreachable', async () => {
    execute.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await controller.check(res);

    expect(status).toHaveBeenCalledWith(503);
    expect(result).toMatchObject({
      status: 'error',
      checks: { database: 'down' },
    });
  });
});
