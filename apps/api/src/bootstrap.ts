import type { LogLevel } from '@nestjs/common';

/**
 * Startup log levels: 'error' is left out so a startup failure (e.g. invalid
 * environment) is printed once by runOrExit, as a plain message.
 */
export const STARTUP_LOG_LEVELS: LogLevel[] = ['log', 'warn', 'fatal'];
export const RUNTIME_LOG_LEVELS: LogLevel[] = ['log', 'warn', 'error', 'fatal'];

/**
 * Runs an entry point; on failure prints the message and exits with code 1.
 * Entry points create the app with `abortOnError: false`, so Nest hands
 * startup errors here instead of exiting on its own.
 */
export async function runOrExit(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
