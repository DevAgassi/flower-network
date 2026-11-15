import { createPool } from './database.module.js';

describe('createPool', () => {
  it('handles idle client errors instead of crashing the process', async () => {
    const pool = createPool('postgres://user:pass@localhost:1/db', 1);

    // pg re-throws 'error' events that have no listener; this must not throw.
    expect(pool.listenerCount('error')).toBeGreaterThan(0);
    expect(() =>
      pool.emit('error', new Error('terminating connection')),
    ).not.toThrow();

    await pool.end();
  });
});
