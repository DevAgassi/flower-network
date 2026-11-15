import { DEVELOPMENT_DATABASE_URL, parseEnv } from './env.schema.js';

describe('parseEnv', () => {
  it('applies development defaults', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      DATABASE_URL: DEVELOPMENT_DATABASE_URL,
      DATABASE_POOL_MAX: 10,
    });
  });

  it('coerces numbers and keeps given values', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://app:secret@db:5432/flower',
      DATABASE_POOL_MAX: '25',
      UNRELATED: 'ignored',
    });
    expect(env).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL: 'postgresql://app:secret@db:5432/flower',
      DATABASE_POOL_MAX: 25,
    });
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
      /DATABASE_URL: is required in production/,
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
      }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL[\s\S]*DATABASE_POOL_MAX/,
        ),
      }),
    );
  });
});
