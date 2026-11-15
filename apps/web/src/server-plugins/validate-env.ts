import { definePlugin } from 'nitro';
import { getServerEnv } from '../env.server';

/**
 * Runs once when the server starts: a misconfigured deployment exits
 * immediately with a readable message instead of failing on the first request.
 */
export default definePlugin(() => {
  try {
    getServerEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
});
