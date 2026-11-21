import { toPage } from '../openapi/pagination.contract.js';
import {
  createProductRequestSchema,
  listProductsQuerySchema,
} from './catalog.contract.js';
import type { ProductVariant } from './catalog.schema.js';
import { sellableVariants } from './catalog.service.js';

const variant = (id: string, isMaster = false) =>
  ({ id, isMaster }) as ProductVariant;

describe('sellableVariants', () => {
  it('sells the master of a simple product', () => {
    expect(sellableVariants([variant('m', true)]).map((v) => v.id)).toEqual([
      'm',
    ]);
  });

  it('sells only the option variants when there are any', () => {
    const variants = [variant('m', true), variant('a'), variant('b')];

    expect(sellableVariants(variants).map((v) => v.id)).toEqual(['a', 'b']);
  });
});

describe('toPage', () => {
  const rows = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

  it('uses the extra row only to tell that another page exists', () => {
    expect(toPage(rows, 2)).toEqual({
      items: [{ id: 'c' }, { id: 'b' }],
      nextCursor: 'b',
    });
  });

  it('has no next cursor on the last page', () => {
    expect(toPage(rows, 3).nextCursor).toBeNull();
  });
});

describe('catalog contract', () => {
  const product = {
    name: 'Ecuador rose',
    slug: 'ecuador-rose',
    sku: 'rose-ecu-60',
  };

  it('stores SKUs uppercase and starts products as drafts', () => {
    expect(createProductRequestSchema.parse(product)).toMatchObject({
      sku: 'ROSE-ECU-60',
      status: 'draft',
    });
  });

  it.each(['Ecuador-Rose', 'ecuador--rose', '-rose', 'троянда', 'rose_ecu'])(
    'rejects the slug %s',
    (slug) => {
      expect(
        createProductRequestSchema.safeParse({ ...product, slug }).success,
      ).toBe(false);
    },
  );

  it.each(['-ROSE', 'ROSE 60', 'РОЗА', ''])('rejects the SKU "%s"', (sku) => {
    expect(
      createProductRequestSchema.safeParse({ ...product, sku }).success,
    ).toBe(false);
  });

  it('reads limit from the query string with a default and a maximum', () => {
    expect(listProductsQuerySchema.parse({}).limit).toBe(50);
    expect(listProductsQuerySchema.parse({ limit: '10' }).limit).toBe(10);
    expect(listProductsQuerySchema.safeParse({ limit: '201' }).success).toBe(
      false,
    );
  });
});
