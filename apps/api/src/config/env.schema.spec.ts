import {
  DEVELOPMENT_DATABASE_URL,
  DEVELOPMENT_OTLP_ENDPOINT,
  DEVELOPMENT_REDIS_URL,
  parseEnv,
} from './env.schema.js';

describe('parseEnv', () => {
  it('applies development defaults', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      DATABASE_URL: DEVELOPMENT_DATABASE_URL,
      REDIS_URL: DEVELOPMENT_REDIS_URL,
      DATABASE_POOL_MAX: 10,
      OUTBOX_RELAY: 'on',
      LOG_LEVEL: 'info',
      OTEL_EXPORTER_OTLP_ENDPOINT: DEVELOPMENT_OTLP_ENDPOINT,
      METRICS_PORT: 9464,
    });
  });

  it('turns tracing off and logs silently outside development by default', () => {
    expect(parseEnv({ NODE_ENV: 'test' })).toMatchObject({
      LOG_LEVEL: 'silent',
      OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
    });
    expect(
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: DEVELOPMENT_DATABASE_URL,
        REDIS_URL: DEVELOPMENT_REDIS_URL,
      }),
    ).toMatchObject({
      LOG_LEVEL: 'info',
      OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
    });
  });

  it('coerces numbers and keeps given values', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://app:secret@db:5432/flower',
      REDIS_URL: 'rediss://cache:6380',
      DATABASE_POOL_MAX: '25',
      OUTBOX_RELAY: 'off',
      LOG_LEVEL: 'debug',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
      METRICS_PORT: '9100',
      UNRELATED: 'ignored',
    });
    expect(env).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL: 'postgresql://app:secret@db:5432/flower',
      REDIS_URL: 'rediss://cache:6380',
      DATABASE_POOL_MAX: 25,
      OUTBOX_RELAY: 'off',
      LOG_LEVEL: 'debug',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
      METRICS_PORT: 9100,
    });
  });

  it('requires DATABASE_URL and REDIS_URL in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
      /DATABASE_URL: is required in production[\s\S]*REDIS_URL: is required in production/,
    );
  });

  it('treats empty values as not set', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'production', DATABASE_URL: '' }),
    ).toThrow(/DATABASE_URL: is required in production/);
    expect(parseEnv({ PORT: '' }).PORT).toBe(3001);
  });

  it('lists every invalid variable in one error', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'staging',
        PORT: '99999',
        DATABASE_URL: 'mysql://db/flower',
        DATABASE_POOL_MAX: 'many',
        OUTBOX_RELAY: 'maybe',
        LOG_LEVEL: 'loud',
      }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL[\s\S]*DATABASE_POOL_MAX[\s\S]*OUTBOX_RELAY[\s\S]*LOG_LEVEL/,
        ),
      }),
    );
  });
});
