import { describe, expect, it } from 'vitest';

import { ROOT_SPACE, SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
import { collapseOrFilter } from '~/core/io/filter-or-collapse';
import { EntityQuery } from '~/core/sync/experimental_query-layer';
import type { Entity, Relation } from '~/core/types';

import { UNNAMED_SUBTOPIC_PROPERTY_ID } from '../ontology';
import { parentTopicWhere } from './use-topic-ancestors';

const CHILD = 'b684a7a520ab4df88147f9351c379a43';
const OTHER_SPACE = '41e851610e13a19441c4d980f2f2ce6b';

function subtopicRelation(fromId: string, typeId: string, spaceId: string): Relation {
  return {
    id: `${fromId}-${typeId}-${spaceId}`,
    entityId: `${fromId}-rel`,
    spaceId,
    renderableType: 'RELATION',
    type: { id: typeId, name: null },
    fromEntity: { id: fromId, name: null },
    toEntity: { id: CHILD, name: null, value: CHILD },
  } as Relation;
}

function parent(id: string, relation: Relation): Entity {
  return { id, name: id, description: null, spaces: [relation.spaceId], types: [], relations: [relation], values: [] };
}

describe('parentTopicWhere', () => {
  it('reads Subtopics relations from the root space only, under both hierarchy properties', () => {
    const filter = collapseOrFilter(convertWhereConditionToEntityFilter(parentTopicWhere(CHILD)));

    // One EXISTS carrying the root space and both property ids — the collapsed shape the OR of two
    // `relations.some` must reach, or the query falls back to the plan that times out.
    expect(JSON.stringify(filter)).toContain(JSON.stringify(ROOT_SPACE));
    expect(filter).toMatchObject({
      and: expect.arrayContaining([
        {
          relations: {
            some: {
              spaceId: { is: ROOT_SPACE },
              toEntityId: { is: CHILD },
              typeId: { in: [SUBTOPIC_RELATION_TYPE_ID, UNNAMED_SUBTOPIC_PROPERTY_ID] },
            },
          },
        },
      ]),
    });
  });

  it('ignores a parent that only another space names', () => {
    const inRoot = parent('root-parent', subtopicRelation('root-parent', SUBTOPIC_RELATION_TYPE_ID, ROOT_SPACE));
    const unnamedInRoot = parent(
      'unnamed-root-parent',
      subtopicRelation('unnamed-root-parent', UNNAMED_SUBTOPIC_PROPERTY_ID, ROOT_SPACE)
    );
    const elsewhere = parent('other-parent', subtopicRelation('other-parent', SUBTOPIC_RELATION_TYPE_ID, OTHER_SPACE));

    const matched = new EntityQuery([inRoot, unnamedInRoot, elsewhere]).where(parentTopicWhere(CHILD)).execute();

    expect(matched.map(entity => entity.id).sort()).toEqual(['root-parent', 'unnamed-root-parent']);
  });
});
