import { type DynamicModule, Module } from '@nestjs/common';
import { OutboxModule, OutboxStorage, type Outbox } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { AppConfigService } from '../config/app-config.module.js';
import {
  DATABASE,
  type Database,
  type Transaction,
} from '../database/database.module.js';
import { OutboxRetention } from './outbox-retention.service.js';

/** PostgreSQL schema that holds the outbox tables (messages, inbox, dead letters). */
export const OUTBOX_SCHEMA = 'nest_outbox';

/**
 * The outbox as modules inject it: `constructor(private readonly outbox: AppOutbox) {}`,
 * then `await this.outbox.add(tx, { topic, key, payload })` inside `db.transaction()`.
 */
export type AppOutbox = Outbox<Transaction>;

export interface AppOutboxOptions {
  /** Overrides the schema; tests use a throwaway one. */
  schema?: string;
  /** Overrides OUTBOX_RELAY; tests turn the poll loop off and call relay.runOnce(). */
  relayEnabled?: boolean;
}

/**
 * Transactional outbox (ADR-12): messages are stored with the business change in
 * one transaction and published afterwards by the relay. Handlers subscribe with
 * `@OnOutboxMessage(topic, { consumer })`. `OutboxModule` is global, so `Outbox`,
 * `OutboxRelay` and `OutboxInbox` can be injected anywhere.
 */
@Module({})
export class AppOutboxModule {
  static register(options: AppOutboxOptions = {}): DynamicModule {
    return {
      module: AppOutboxModule,
      imports: [
        OutboxModule.forRootAsync({
          inject: [AppConfigService],
          useFactory: (config: AppConfigService) => ({
            relay: {
              enabled:
                options.relayEnabled ??
                config.get('OUTBOX_RELAY', { infer: true }) === 'on',
              pollInterval: '1s',
              lease: '30s',
              publishTimeout: '10s',
            },
          }),
        }),
      ],
      providers: [
        {
          provide: PostgresOutboxStore,
          inject: [DATABASE, OutboxStorage, AppConfigService],
          useFactory: (
            db: Database,
            storage: OutboxStorage,
            config: AppConfigService,
          ) =>
            new PostgresOutboxStore(
              {
                executor: fromDrizzle(db),
                schema: options.schema ?? OUTBOX_SCHEMA,
                // Development and tests create the schema at startup; production
                // applies it with `pnpm db:migrate` and refuses an outdated one.
                migrate:
                  config.get('NODE_ENV', { infer: true }) !== 'production',
              },
              storage,
            ),
        },
        OutboxRetention,
      ],
    };
  }
}
