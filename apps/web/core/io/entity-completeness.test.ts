import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { getEntity } from './queries';

const query = vi.hoisted(() => vi.fn());
vi.mock('./graphql-client', () => ({ graphql: (...args: unknown[]) => query(...args) }));

it('marks a fully drained relation connection complete even at the list cap', async () => {
  const id = '11111111111111111111111111111111';
  const relation = {
    id,
    entityId: id,
    spaceId: id,
    position: null,
    verified: null,
    toSpaceId: null,
    fromEntity: { id, name: 'From' },
    toEntity: { id, name: 'To', types: [], valuesList: [] },
    type: { id, name: 'Type' },
  };
  const entity = {
    id,
    name: 'Entity',
    description: null,
    types: [],
    spaceIds: [],
    valuesList: [],
    relations: {
      nodes: Array.from({ length: 1000 }, () => relation),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
  query.mockImplementation(({ decoder }: { decoder: (data: unknown) => unknown }) =>
    Effect.succeed(decoder({ entity }))
  );
  const decoded = await Effect.runPromise(getEntity(id));
  expect(decoded?.relations).toHaveLength(1000);
  expect(decoded?.relationsComplete).toBe(true);
});
