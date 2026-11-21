import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runOrExit } from '../bootstrap.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { loginRequestSchema } from './identity.contract.js';
import { SessionStore } from './session.store.js';
import { UsersService } from './users.service.js';

/** Only what creating a user needs: no HTTP, no outbox relay, no jobs. */
@Module({
  imports: [AppConfigModule, DatabaseModule, RedisModule],
  providers: [UsersService, SessionStore],
})
class CreateUserModule {}

const USAGE =
  'Usage: pnpm --filter @flower/api user:create --email <email> --name "<name>"';

/**
 * Creates a staff user and prints a generated password once
 * (`pnpm --filter @flower/api user:create`). Until the admin screens exist
 * (ADM-01) this is how the first users are made.
 */
await runOrExit(async () => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  if (!values.email || !values.name) throw new Error(USAGE);
  const email = loginRequestSchema.shape.email.safeParse(values.email);
  if (!email.success) throw new Error(`Not a valid email: ${values.email}`);

  const app = await NestFactory.createApplicationContext(CreateUserModule, {
    abortOnError: false,
    logger: ['warn', 'fatal'],
  });
  try {
    const users = app.get(UsersService);
    if (await users.findByEmail(email.data)) {
      throw new Error(`A user with email ${email.data} already exists`);
    }
    const password = randomBytes(12).toString('base64url');
    const user = await users.create({
      email: email.data,
      name: values.name,
      password,
    });
    console.log(
      `Created ${user.email} (${user.id}).\nPassword (shown once): ${password}`,
    );
  } finally {
    await app.close();
  }
});
