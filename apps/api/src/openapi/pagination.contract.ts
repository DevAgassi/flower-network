import { z, type ZodType } from 'zod';

/**
 * Cursor pagination, the convention for every list that can grow large:
 * `?limit=50&cursor=<id>` → `{ items, nextCursor }`, newest first by UUIDv7
 * id. No OFFSET scans and no COUNT(*) (init.md §5).
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const paginationQuery = {
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .meta({ description: `Page size, 1–${MAX_PAGE_SIZE}` }),
  cursor: z.uuid().optional().meta({
    description: '`nextCursor` of the previous page; omit for the first page',
  }),
};

/** `{ items, nextCursor }`; `nextCursor` is null on the last page. */
export function pageSchema<T extends ZodType>(item: T, id: string) {
  return z
    .object({
      items: z.array(item),
      nextCursor: z.uuid().nullable().meta({
        description: 'Pass as `cursor` to get the next page; null on the last',
      }),
    })
    .meta({ id });
}

/**
 * Turns `limit + 1` fetched rows into a page: the extra row only tells that
 * another page exists.
 */
export function toPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? items[items.length - 1].id : null,
  };
}
