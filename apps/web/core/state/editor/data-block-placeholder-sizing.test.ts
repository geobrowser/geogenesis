import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import { placeholderCollectionItemCount } from './data-block-placeholder-sizing';

const BLOCK = 'block-1';

const item = (id: string, over: Partial<Relation> = {}) =>
  ({
    id,
    fromEntity: { id: BLOCK },
    toEntity: { id: `entity-${id}` },
    type: { id: SystemIds.COLLECTION_ITEM_RELATION_TYPE },
    ...over,
  }) as unknown as Relation;

const count = (over: Partial<Parameters<typeof placeholderCollectionItemCount>[0]> = {}) =>
  placeholderCollectionItemCount({
    blockId: BLOCK,
    isQuerySource: false,
    initialBlockEntities: [{ id: BLOCK }],
    relations: [],
    ...over,
  });

describe('placeholderCollectionItemCount', () => {
  it('counts a loaded collection’s live items', () => {
    const relations = [
      item('a'),
      item('b'),
      item('deleted', { isDeleted: true }),
      item('elsewhere', { fromEntity: { id: 'other-block', name: null } }),
    ];

    expect(count({ relations })).toBe(2);
  });

  it('reports a loaded collection with no items as a known 0', () => {
    expect(count()).toBe(0);
  });

  it('leaves the count unknown when the page did not send the block entity', () => {
    expect(count({ initialBlockEntities: [], relations: [item('a')] })).toBeUndefined();
  });

  it('leaves a query block’s count unknown', () => {
    expect(count({ isQuerySource: true, relations: [item('a')] })).toBeUndefined();
  });
});
