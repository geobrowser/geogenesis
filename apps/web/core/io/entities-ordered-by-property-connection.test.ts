import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { SortOrder } from '~/core/gql/graphql';

import { graphql } from './graphql-client';
import { getEntitiesOrderedByPropertyConnection } from './queries';

vi.mock('./graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

describe('getEntitiesOrderedByPropertyConnection', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
    graphqlMock.mockImplementation(({ decoder }) =>
      Effect.succeed(
        decoder({
          entitiesOrderedByPropertyConnection: {
            nodes: [],
            pageInfo: { endCursor: null, hasNextPage: false },
          },
        })
      )
    );
  });

  function runQuery(options: Partial<Parameters<typeof getEntitiesOrderedByPropertyConnection>[0]> = {}) {
    return Effect.runPromise(
      getEntitiesOrderedByPropertyConnection({
        propertyId: 'property-id',
        sortDirection: SortOrder.Desc,
        dataType: 'integer',
        limit: 9,
        ...options,
      })
    );
  }

  function lastVariables() {
    return graphqlMock.mock.calls.at(-1)?.[0]?.variables;
  }

  it('promotes multi-space filters to the parent spaceIds arg', async () => {
    await runQuery({
      filter: {
        spaceIds: { in: ['space-a', 'space-b'] },
        name: { isNull: false, isNot: '' },
      },
    });

    expect(lastVariables()).toMatchObject({
      spaceId: undefined,
      spaceIds: ['space-a', 'space-b'],
      filter: { name: { isNull: false, isNot: '' } },
    });
  });

  it('promotes single-space filters to the parent spaceIds arg and keeps spaceId for nested lists', async () => {
    await runQuery({
      filter: {
        spaceIds: { in: ['space-a'] },
        name: { isNull: false, isNot: '' },
      },
    });

    expect(lastVariables()).toMatchObject({
      spaceId: 'space-a',
      spaceIds: ['space-a'],
      filter: { name: { isNull: false, isNot: '' } },
    });
  });

  it('promotes type filters to the parent typeIds arg', async () => {
    await runQuery({
      filter: {
        typeIds: { in: ['type-a', 'type-b'] },
        name: { isNull: false, isNot: '' },
      },
    });

    expect(lastVariables()).toMatchObject({
      typeIds: ['type-a', 'type-b'],
      filter: { name: { isNull: false, isNot: '' } },
    });
  });

  it('promotes single-type filters to the parent typeIds arg', async () => {
    await runQuery({
      filter: {
        typeIds: { anyEqualTo: 'type-a' },
        name: { isNull: false, isNot: '' },
      },
    });

    expect(lastVariables()).toMatchObject({
      typeIds: ['type-a'],
      filter: { name: { isNull: false, isNot: '' } },
    });
  });

  it('strips only the promoted and-wrapped scope clauses', async () => {
    await runQuery({
      filter: {
        and: [
          { spaceIds: { in: ['space-a', 'space-b'] } },
          { typeIds: { in: ['type-a', 'type-b'] } },
          { name: { isNull: false, isNot: '' } },
        ],
      },
    });

    expect(lastVariables()).toMatchObject({
      spaceIds: ['space-a', 'space-b'],
      typeIds: ['type-a', 'type-b'],
      filter: { name: { isNull: false, isNot: '' } },
    });
  });

  it('lets explicit top-level option values override extracted filter values', async () => {
    await runQuery({
      spaceId: 'explicit-space',
      spaceIds: ['ignored-space'],
      typeIds: ['explicit-type'],
      filter: {
        spaceIds: { in: ['filter-space-a', 'filter-space-b'] },
        typeIds: { in: ['filter-type-a', 'filter-type-b'] },
        name: { isNull: false, isNot: '' },
      },
    });

    expect(lastVariables()).toMatchObject({
      spaceId: 'explicit-space',
      spaceIds: ['ignored-space'],
      typeIds: ['explicit-type'],
      filter: { name: { isNull: false, isNot: '' } },
    });
  });

  it('lets explicit multi-space options override extracted multi-space filters', async () => {
    await runQuery({
      spaceIds: ['explicit-space-a', 'explicit-space-b'],
      filter: {
        spaceIds: { in: ['filter-space-a', 'filter-space-b'] },
        name: { isNull: false, isNot: '' },
      },
    });

    expect(lastVariables()).toMatchObject({
      spaceId: undefined,
      spaceIds: ['explicit-space-a', 'explicit-space-b'],
      filter: { name: { isNull: false, isNot: '' } },
    });
  });
});
