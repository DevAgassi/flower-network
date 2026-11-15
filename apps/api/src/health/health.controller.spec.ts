import { OutboxRelay } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { DATABASE } from '../database/database.module.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const execute = vi.fn();
  const stats = vi.fn();
  const status = vi.fn();
  const res = { status } as unknown as Response;
  let controller: HealthController;

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    stats.mockReset().mockResolvedValue({ pending: 0, deadLetters: 0 });
    status.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DATABASE, useValue: { execute } },
        { provide: OutboxRelay, useValue: { stats } },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('reports ok with 200 when every dependency answers', async () => {
    const result = await controller.check(res);

    expect(status).toHaveBeenCalledWith(200);
    expect(result).toMatchObject({
      status: 'ok',
      service: 'api',
      checks: { database: 'up', outbox: 'up' },
    });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('reports error with 503 when the database is unreachable', async () => {
    execute.mockRejectedValue(new Error('connect ECONNREFUSED'));
    stats.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await controller.check(res);

    expect(status).toHaveBeenCalledWith(503);
    expect(result).toMatchObject({
      status: 'error',
      checks: { database: 'down', outbox: 'down' },
    });
  });

  it('reports error with 503 when only the outbox store fails', async () => {
    stats.mockRejectedValue(
      new Error('relation "nest_outbox.messages" does not exist'),
    );

    const result = await controller.check(res);

    expect(status).toHaveBeenCalledWith(503);
    expect(result.checks).toEqual({ database: 'up', outbox: 'down' });
  });
});
