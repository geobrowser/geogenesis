import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { RANKING_BLOCK_TYPE_ID, RANKING_BLOCK_TYPE_NAME } from '~/core/ranking-block-ids';
import type { Relation, Value } from '~/core/types';

import { isRankingBlockEntity, isRankingSetupConfigured } from './ranking-block-state';

const spaceId = 'space-1';
const blockId = 'block-1';

function typesRelation(typeId: string, name: string): Relation {
  return {
    id: 'rel-1',
    entityId: 'rel-entity-1',
    spaceId,
    position: 'a0',
    renderableType: 'RELATION',
    type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    fromEntity: { id: blockId, name: null },
    toEntity: { id: typeId, name, value: typeId },
  };
}

describe('isRankingBlockEntity', () => {
  it('detects ranking blocks by Types relation type id', () => {
    expect(
      isRankingBlockEntity(blockId, [typesRelation(RANKING_BLOCK_TYPE_ID, RANKING_BLOCK_TYPE_NAME)], spaceId)
    ).toBe(true);
    expect(isRankingBlockEntity(blockId, [typesRelation(SystemIds.DATA_BLOCK, 'Data Block')], spaceId)).toBe(false);
  });

  it('detects legacy ranking blocks by Types relation display name', () => {
    expect(isRankingBlockEntity(blockId, [typesRelation(SystemIds.DATA_BLOCK, RANKING_BLOCK_TYPE_NAME)], spaceId)).toBe(
      true
    );
  });
});

describe('isRankingSetupConfigured', () => {
  it('requires a name and a type filter', () => {
    const filterValue: Value = {
      id: 'v1',
      entity: { id: blockId, name: null },
      property: { id: SystemIds.FILTER, name: 'Filter', dataType: 'TEXT' },
      spaceId,
      value: JSON.stringify({
        filter: {
          [SystemIds.TYPES_PROPERTY]: { is: 'type-1' },
        },
      }),
    };

    expect(isRankingSetupConfigured(blockId, 'Top people', [filterValue], spaceId)).toBe(true);
    expect(isRankingSetupConfigured(blockId, '', [filterValue], spaceId)).toBe(false);
    expect(isRankingSetupConfigured(blockId, 'Top people', [], spaceId)).toBe(false);
  });
});
