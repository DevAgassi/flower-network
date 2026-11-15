// Uses the real database: run `pnpm infra:up` first. Every test works in a
// throwaway PostgreSQL schema that is dropped at the end.
import { Injectable } from '@nestjs/common';
import {
  NonRetryableMessageError,
  OnOutboxMessage,
  Outbox,
  OutboxInbox,
  OutboxRelay,
  OutboxStorage,
  OutboxTransactionRequiredError,
  type OutboxHandlerContext,
} from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import {
  outboxInboxStoreContract,
  outboxStoreContract,
  type OutboxInboxStoreHarness,
  type OutboxStoreHarness,
} from '@nestjs/outbox/testing';
import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { loadEnv } from '../src/config/env-files.js';
import {
  DATABASE,
  DatabaseModule,
  type Database,
  type Transaction,
} from '../src/database/database.module.js';
import {
  AppOutboxModule,
  type AppOutbox,
} from '../src/outbox/outbox.module.js';

const env = loadEnv();
const createdSchemas: string[] = [];
let schemaCounter = 0;

function uniqueSchema(label: string): string {
  const name = `outbox_t_${label}_${process.pid}_${++schemaCounter}_${Date.now().toString(36)}`;
  createdSchemas.push(name);
  return name;
}

@Injectable()
class TestHandlers {
  readonly received: { payload: unknown; id: string }[] = [];
  flakyAttempts = 0;

  @OnOutboxMessage('test.ping', { consumer: 'test-ping' })
  ping(payload: unknown, ctx: OutboxHandlerContext): void {
    this.received.push({ payload, id: ctx.message.id });
  }

  @OnOutboxMessage('test.reject', { consumer: 'test-reject' })
  reject(): void {
    throw new NonRetryableMessageError('cannot be processed');
  }

  @OnOutboxMessage('test.flaky', { consumer: 'test-flaky' })
  flaky(): void {
    this.flakyAttempts++;
    throw new Error('downstream unavailable');
  }
}

interface TestApp {
  moduleRef: TestingModule;
  db: Database;
  outbox: AppOutbox;
  relay: OutboxRelay;
  handlers: TestHandlers;
}

/** The app's outbox wiring with the poll loop off: tests drive relay.runOnce(). */
async function createApp(schema: string): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      DatabaseModule,
      AppOutboxModule.register({ schema, relayEnabled: false }),
    ],
    providers: [TestHandlers],
  }).compile();
  await moduleRef.init();
  return {
    moduleRef,
    db: moduleRef.get<Database>(DATABASE),
    outbox: moduleRef.get<AppOutbox>(Outbox),
    relay: moduleRef.get(OutboxRelay),
    handlers: moduleRef.get(TestHandlers),
  };
}

const adminPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
const adminDb = drizzle({ client: adminPool });

afterAll(async () => {
  for (const schema of createdSchemas) {
    await adminDb.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
  }
  await adminPool.end();
});

describe('Transactional outbox (e2e)', () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createApp(uniqueSchema('app'));
  });

  afterEach(async () => {
    await app.moduleRef.close();
  });

  it('delivers a message only after its transaction commits', async () => {
    await app.db.transaction(async (tx) => {
      await app.outbox.add(tx, { topic: 'test.ping', payload: { n: 1 } });
      expect(app.handlers.received).toHaveLength(0);
    });
    expect(app.handlers.received).toHaveLength(0);

    const run = await app.relay.runOnce();

    expect(run).toMatchObject({ claimed: 1, published: 1 });
    expect(app.handlers.received.map((r) => r.payload)).toEqual([{ n: 1 }]);
    expect(await app.relay.stats()).toMatchObject({
      pending: 0,
      deadLetters: 0,
    });
  });

  it('never delivers a message whose transaction rolled back', async () => {
    await expect(
      app.db.transaction(async (tx) => {
        await app.outbox.add(tx, { topic: 'test.ping', payload: { n: 2 } });
        throw new Error('business rule failed after add()');
      }),
    ).rejects.toThrow('business rule failed after add()');

    expect(await app.relay.runOnce()).toMatchObject({ claimed: 0 });
    expect(app.handlers.received).toHaveLength(0);
  });

  it('refuses add() outside a transaction (no dual write)', async () => {
    await expect(
      app.outbox.add(app.db as unknown as Transaction, {
        topic: 'test.ping',
        payload: {},
      }),
    ).rejects.toBeInstanceOf(OutboxTransactionRequiredError);
  });

  it('processes a redelivered message once (inbox)', async () => {
    await app.db.transaction(async (tx) => {
      await app.outbox.add(tx, { topic: 'test.ping', payload: { n: 3 } });
    });
    await app.relay.runOnce();
    const [{ id }] = app.handlers.received;
    const work = vi.fn();

    // A second delivery of the same message id to the same consumer.
    const result = await app.moduleRef
      .get(OutboxInbox)
      .process('test-ping', id, work);

    expect(result.duplicate).toBe(true);
    expect(work).not.toHaveBeenCalled();
  });

  it('dead-letters a message its handler rejects', async () => {
    await app.db.transaction(async (tx) => {
      await app.outbox.add(tx, { topic: 'test.reject', payload: {} });
    });

    expect(await app.relay.runOnce()).toMatchObject({ deadLettered: 1 });
    expect(await app.relay.stats()).toMatchObject({
      pending: 0,
      deadLetters: 1,
    });
  });

  it('keeps and retries a message whose handler fails', async () => {
    await app.db.transaction(async (tx) => {
      await app.outbox.add(tx, { topic: 'test.flaky', payload: {} });
    });

    expect(await app.relay.runOnce()).toMatchObject({ retried: 1 });
    expect(app.handlers.flakyAttempts).toBe(1);
    expect(await app.relay.stats()).toMatchObject({
      pending: 1,
      deadLetters: 0,
    });
  });
});

describe('Transactional outbox across a restart (e2e)', () => {
  it('delivers a committed message after the producing process stopped', async () => {
    const schema = uniqueSchema('restart');
    const producer = await createApp(schema);
    await producer.db.transaction(async (tx) => {
      await producer.outbox.add(tx, { topic: 'test.ping', payload: { n: 4 } });
    });
    await producer.moduleRef.close(); // the process stops before publishing

    const restarted = await createApp(schema);
    try {
      expect(await restarted.relay.runOnce()).toMatchObject({ published: 1 });
      expect(restarted.handlers.received.map((r) => r.payload)).toEqual([
        { n: 4 },
      ]);
    } finally {
      await restarted.moduleRef.close();
    }
  });
});

describe('PostgresOutboxStore on our PostgreSQL: package contract', () => {
  const schema = uniqueSchema('contract');

  beforeAll(async () => {
    await new PostgresOutboxStore({
      executor: fromDrizzle(adminDb),
      schema,
      migrate: false,
    }).migrate();
  });

  /** A store on emptied tables, built the way Nest builds it. */
  async function freshStore(): Promise<
    OutboxStoreHarness<Transaction> & OutboxInboxStoreHarness<Transaction>
  > {
    await adminDb.execute(
      sql.raw(
        `TRUNCATE "${schema}".messages, "${schema}".dead_letters, "${schema}".inbox RESTART IDENTITY`,
      ),
    );
    return {
      store: new PostgresOutboxStore(
        { executor: fromDrizzle(adminDb), schema, migrate: false },
        new OutboxStorage(),
      ),
      transaction: (work) => adminDb.transaction(work),
      notATransaction: adminDb,
    };
  }

  // concurrent: races between producers and relays on separate connections.
  for (const c of outboxStoreContract(freshStore, { concurrent: true })) {
    it(c.name, () => c.run(), 30_000);
  }

  describe('inbox contract', () => {
    for (const c of outboxInboxStoreContract(freshStore, {
      concurrent: true,
    })) {
      it(c.name, () => c.run(), 30_000);
    }
  });
});
