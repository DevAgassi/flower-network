import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports the api as healthy', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
