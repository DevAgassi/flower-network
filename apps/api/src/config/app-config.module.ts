import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ENV_FILE_PATHS, isProduction } from './env-files.js';
import { parseEnv, type Env } from './env.schema.js';

/**
 * Typed access to validated configuration:
 * `constructor(private readonly config: AppConfigService) {}` then
 * `this.config.get('DATABASE_URL', { infer: true })`.
 */
export class AppConfigService extends ConfigService<Env, true> {}

/**
 * Validates the environment with the zod schema when the module is created.
 * In production .env files are ignored: only real environment variables count.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: isProduction(),
      envFilePath: ENV_FILE_PATHS,
      validate: parseEnv,
    }),
  ],
  providers: [{ provide: AppConfigService, useExisting: ConfigService }],
  exports: [AppConfigService],
})
export class AppConfigModule {}
