import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { BLOCK_CONFIG_TYPE_ID, getRelationForBlockConfigType } from './block-types';

describe('getRelationForBlockConfigType', () => {
  it('types the block relation entity as Block config', () => {
    const relation = getRelationForBlockConfigType(
      {
        id: 'blocks-relation-id',
        entityId: 'blocks-relation-entity-id',
        spaceId: 'space-id',
        position: 'a0',
        renderableType: 'DATA',
        type: {
          id: SystemIds.BLOCKS,
          name: 'Blocks',
        },
        fromEntity: {
          id: 'page-id',
          name: null,
        },
        toEntity: {
          id: 'data-block-id',
          name: null,
          value: 'data-block-id',
        },
      },
      'space-id'
    );

    expect(relation.spaceId).toBe('space-id');
    expect(relation.type).toEqual({ id: SystemIds.TYPES_PROPERTY, name: 'Types' });
    expect(relation.fromEntity).toEqual({ id: 'blocks-relation-entity-id', name: null });
    expect(relation.toEntity).toEqual({
      id: BLOCK_CONFIG_TYPE_ID,
      name: 'Block config',
      value: BLOCK_CONFIG_TYPE_ID,
    });
  });
});
