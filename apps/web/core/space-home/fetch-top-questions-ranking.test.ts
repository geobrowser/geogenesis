import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { QUESTION_TYPE_ID } from '~/core/questions/ontology';
import { RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

import { blockHasQuestionTypeFilter, isRankingBlock, isTopQuestionsRankingBlock } from './fetch-top-questions-ranking';

const spaceId = 'space-1';

function makeBlock(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'block-1',
    name: 'Top questions',
    description: null,
    spaces: [spaceId],
    values: [],
    relations: [],
    types: [],
    ...overrides,
  } as Entity;
}

describe('top questions ranking discovery', () => {
  it('detects question type filters with hyphen-insensitive ids', () => {
    const block = makeBlock({
      values: [
        {
          id: 'filter-1',
          entity: { id: 'block-1', name: null },
          property: { id: SystemIds.FILTER, name: 'Filter', dataType: 'TEXT' },
          spaceId,
          value: JSON.stringify({
            filter: {
              [SystemIds.TYPES_PROPERTY]: { is: QUESTION_TYPE_ID },
            },
          }),
        },
      ],
      relations: [
        {
          id: 'type-rel',
          entityId: 'type-rel-entity',
          spaceId,
          position: 'a0',
          renderableType: 'RELATION',
          type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
          fromEntity: { id: 'block-1', name: null },
          toEntity: { id: RANKING_BLOCK_TYPE_ID, name: 'Ranking Block', value: RANKING_BLOCK_TYPE_ID },
        },
      ],
    });

    expect(blockHasQuestionTypeFilter(block, spaceId)).toBe(true);
    expect(isRankingBlock(block, spaceId)).toBe(true);
    expect(isTopQuestionsRankingBlock(block, spaceId)).toBe(true);
  });
});
