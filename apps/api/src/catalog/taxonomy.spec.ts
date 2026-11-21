import type { Taxon } from './catalog.schema.js';
import { depthFirst, isWithin } from './taxonomy.service.js';

const taxon = (id: string, parentId: string | null, position = 0, name = id) =>
  ({ id, parentId, position, name }) as Taxon;

describe('depthFirst', () => {
  it('puts each parent before its children and orders siblings by position, then name', () => {
    const rows = [
      taxon('ecuador', 'roses'),
      taxon('plants', null, 2),
      taxon('roses', 'flowers', 1),
      taxon('flowers', null, 1),
      taxon('tulips', 'flowers', 0),
      taxon('bouquets', null, 1, 'Bouquets'),
    ];

    expect(depthFirst(rows).map((t) => [t.id, t.depth])).toEqual([
      ['bouquets', 1],
      ['flowers', 1],
      ['tulips', 2],
      ['roses', 2],
      ['ecuador', 3],
      ['plants', 1],
    ]);
  });
});

describe('isWithin', () => {
  it('treats a path as within itself and its ancestors only', () => {
    expect(isWithin('flowers.roses', 'flowers')).toBe(true);
    expect(isWithin('flowers', 'flowers')).toBe(true);
    expect(isWithin('flowers-dried', 'flowers')).toBe(false);
    expect(isWithin('flowers', 'flowers.roses')).toBe(false);
  });
});
