import { Kind, type OperationDefinitionNode } from 'graphql';
import { describe, expect, it } from 'vitest';

import { buildExploreFeedFilter } from './explore-feed-filter';
import {
  exploreEntitiesConnectionDocument,
  exploreEntitiesNoPageInfoConnectionDocument,
} from './explore-entities-document';
import { exploreEntitiesSpaceIdsArg } from './fetch-explore-feed';

const SPACES = ['a19c345ab9866679b001d7d2138d88a1', '784bfddae3f3976118c561bf28195b44'];

describe('exploreEntitiesSpaceIdsArg (GEO-3703)', () => {
  it('drops spaceIds while the name clause already scopes the query to the same spaces', () => {
    expect(exploreEntitiesSpaceIdsArg({ spaceIds: SPACES })).toBeUndefined();
    expect(exploreEntitiesSpaceIdsArg({ spaceIds: SPACES, requireName: true })).toBeUndefined();

    const filter = buildExploreFeedFilter({ spaceIds: SPACES, time: 'all' });
    expect(filter.values?.some?.spaceId).toEqual({ in: SPACES });
  });

  it('keeps spaceIds when no name clause scopes the query', () => {
    expect(exploreEntitiesSpaceIdsArg({ spaceIds: SPACES, requireName: false })).toEqual({ in: SPACES });
    expect(buildExploreFeedFilter({ spaceIds: SPACES, time: 'all', requireName: false }).values).toBeUndefined();
  });

  it.each([
    ['paged', exploreEntitiesConnectionDocument],
    ['no pageInfo', exploreEntitiesNoPageInfoConnectionDocument],
  ])('declares $spaceIds as nullable in the %s document', (_name, doc) => {
    const op = doc.definitions.find(d => d.kind === Kind.OPERATION_DEFINITION) as OperationDefinitionNode;
    const def = op.variableDefinitions?.find(v => v.variable.name.value === 'spaceIds');
    expect(def?.type.kind).toBe(Kind.NAMED_TYPE);
  });
});
