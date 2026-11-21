import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runOrExit } from '../bootstrap.js';
import { AppConfigModule } from '../config/app-config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { loginRequestSchema, staffRoleSchema } from './identity.contract.js';
import { generatePassword } from './password.js';
import { STAFF_ROLES } from './permissions.js';
import { SessionStore } from './session.store.js';
import { UsersService } from './users.service.js';

/** Only what creating a user needs: no HTTP, no outbox relay, no jobs. */
@Module({
  imports: [AppConfigModule, DatabaseModule, RedisModule],
  providers: [UsersService, SessionStore],
})
class CreateUserModule {}

const USAGE = `Usage: pnpm --filter @flower/api user:create --email <email> --name "<name>" --role <${STAFF_ROLES.join('|')}>`;

/**
 * Creates a staff user and prints a generated password once
 * (`pnpm --filter @flower/api user:create`). Used for the first owner; after
 * that the owner manages staff through `/staff` (screens in ADM-01).
 * Florists and couriers made here have no locations yet.
 */
await runOrExit(async () => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
    },
  });
  if (!values.email || !values.name || !values.role) throw new Error(USAGE);
  const role = staffRoleSchema.safeParse(values.role);
  if (!role.success) throw new Error(`Unknown role: ${values.role}\n${USAGE}`);
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
    const password = generatePassword();
    const user = await users.create({
      email: email.data,
      name: values.name,
      password,
      role: role.data,
    });
    console.log(
      `Created ${user.role} ${user.email} (${user.id}).\nPassword (shown once): ${password}`,
    );
  } finally {
    await app.close();
  }
});
