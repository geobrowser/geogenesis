import * as Effect from 'effect/Effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queries: [] as string[], responses: [] as unknown[] }));

vi.mock('~/core/environment', () => ({ Environment: { getConfig: () => ({ api: 'https://api.test/graphql' }) } }));

vi.mock('./graphql', () => ({
  graphql: ({ query }: { query: string }) => {
    mocks.queries.push(query);
    return Effect.succeed(mocks.responses.shift());
  },
}));

const { fetchPersonalSpacesByPageIds } = await import('./fetch-personal-spaces-by-page-ids');

const PAGE = '3772c3cc-4414-41d5-977e-f39c4c02bd6e';
const PAGE_DASHLESS = '3772c3cc441441d5977ef39c4c02bd6e';
const PERSONAL = '003eaa9b7a56fa847afd6f2e8cc518a6';
const MENTIONS_THEM = '0157c16d1365398c83c5b5a0b2049ba5';

afterEach(() => {
  mocks.queries = [];
  mocks.responses = [];
});

describe('fetchPersonalSpacesByPageIds', () => {
  it('picks the personal space the entity is the page of, not one that merely holds it', async () => {
    mocks.responses = [
      { entities: [{ id: PAGE_DASHLESS, spaceIds: [MENTIONS_THEM, PERSONAL] }] },
      {
        spaces: [
          { id: MENTIONS_THEM, type: 'DAO', page: { id: 'someone-else' } },
          { id: PERSONAL, type: 'PERSONAL', page: { id: PAGE_DASHLESS } },
        ],
      },
    ];

    const result = await fetchPersonalSpacesByPageIds([PAGE]);

    expect([...result]).toEqual([[PAGE_DASHLESS, PERSONAL]]);
  });

  it('queries nothing for ids that are not uuids', async () => {
    const result = await fetchPersonalSpacesByPageIds(['user-them', '"}) { id } #']);

    expect(result.size).toBe(0);
    expect(mocks.queries).toEqual([]);
  });

  it('leaves out someone with no personal space', async () => {
    mocks.responses = [{ entities: [{ id: PAGE_DASHLESS, spaceIds: [] }] }];

    const result = await fetchPersonalSpacesByPageIds([PAGE]);

    expect(result.size).toBe(0);
    expect(mocks.queries).toHaveLength(1);
  });
});
