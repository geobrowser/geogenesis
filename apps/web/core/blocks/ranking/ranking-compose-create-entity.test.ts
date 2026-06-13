import { describe, expect, it } from 'vitest';

import type { Relation, Value } from '~/core/types';

import { filterLocalChangesToEntitySubgraph } from './ranking-compose-create-entity';

describe('filterLocalChangesToEntitySubgraph', () => {
  it('includes values and relations reachable from the root entity', () => {
    const values: Value[] = [
      {
        id: 'v-root',
        entity: { id: 'root', name: null },
        property: { id: 'name', name: 'Name', dataType: 'TEXT' },
        spaceId: 'space-1',
        value: 'Title',
      },
      {
        id: 'v-block',
        entity: { id: 'block-1', name: null },
        property: { id: 'body', name: 'Body', dataType: 'TEXT' },
        spaceId: 'space-1',
        value: 'Hello',
      },
      {
        id: 'v-other',
        entity: { id: 'other', name: null },
        property: { id: 'name', name: 'Name', dataType: 'TEXT' },
        spaceId: 'space-1',
        value: 'Nope',
      },
    ];

    const relations: Relation[] = [
      {
        id: 'r-blocks',
        entityId: 'r-blocks',
        spaceId: 'space-1',
        renderableType: 'RELATION',
        fromEntity: { id: 'root', name: null },
        toEntity: { id: 'block-1', name: null, value: 'block-1' },
        type: { id: 'blocks', name: 'Blocks' },
      },
    ];

    const result = filterLocalChangesToEntitySubgraph('root', values, relations);

    expect(result.values.map(v => v.id).sort()).toEqual(['v-block', 'v-root']);
    expect(result.relations.map(r => r.id)).toEqual(['r-blocks']);
  });
});
