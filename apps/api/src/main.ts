import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.module.js';

async function bootstrap() {
  // abortOnError: false hands startup errors (e.g. invalid environment) to the
  // catch below instead of Nest exiting itself; 'error' is left out of the
  // startup logger so the failure is printed once, as a plain message.
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: ['log', 'warn', 'fatal'],
  });
  app.useLogger(['log', 'warn', 'error', 'fatal']);
  app.enableShutdownHooks();
  const config = app.get(AppConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}

try {
  await bootstrap();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
