import { Injectable, Logger } from '@nestjs/common';
import { OutboxInbox } from '@nestjs/outbox';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.module.js';

/** Inbox records older than this are deleted; longer than any redelivery. */
export const INBOX_RETENTION = '30d';

/**
 * The package never deletes inbox records itself, so the table would grow
 * forever. Runs where the relay runs (worker in production); deleting is
 * idempotent, so several workers doing it at once is harmless.
 */
@Injectable()
export class OutboxRetention {
  private readonly logger = new Logger(OutboxRetention.name);

  constructor(
    private readonly inbox: OutboxInbox,
    private readonly config: AppConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'outbox-inbox-prune' })
  async pruneInbox(): Promise<number> {
    if (this.config.get('OUTBOX_RELAY', { infer: true }) === 'off') return 0;
    try {
      const removed = await this.inbox.prune(INBOX_RETENTION);
      this.logger.log(
        `Pruned ${removed} inbox records older than ${INBOX_RETENTION}`,
      );
      return removed;
    } catch (err) {
      // A failed prune must not crash the process; it runs again tomorrow.
      this.logger.warn(
        `Inbox prune failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }
}
