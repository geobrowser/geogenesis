import * as Effect from 'effect/Effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queries: [] as string[],
  responses: [] as unknown[],
  respond: null as ((query: string) => unknown) | null,
}));

vi.mock('~/core/environment', () => ({ Environment: { getConfig: () => ({ api: 'https://api.test/graphql' }) } }));

vi.mock('./graphql', () => ({
  graphql: ({ query }: { query: string }) => {
    mocks.queries.push(query);
    return Effect.succeed(mocks.respond ? mocks.respond(query) : mocks.responses.shift());
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
  mocks.respond = null;
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

  // GEO-3395: Susan Winter's entity is the page of two personal spaces. The order the API lists
  // them in must not decide which one she is shown as.
  it('picks the most active personal space when a person fronts more than one', async () => {
    const MAIN = 'd0000000000000000000000000000001';
    const DUPLICATE = '10000000000000000000000000000002';
    for (const order of [
      [MAIN, DUPLICATE],
      [DUPLICATE, MAIN],
    ]) {
      mocks.queries = [];
      mocks.responses = [
        { entities: [{ id: PAGE_DASHLESS, spaceIds: order }] },
        { spaces: order.map(id => ({ id, type: 'PERSONAL', page: { id: PAGE_DASHLESS } })) },
        Object.fromEntries(
          order.flatMap((id, index) => [
            [`v${index}`, { totalCount: id === MAIN ? 321 : 7 }],
            [`s${index}`, { valuesConnection: { totalCount: 10 }, relationsConnection: { totalCount: 15 } }],
          ])
        ),
      ];

      const result = await fetchPersonalSpacesByPageIds([PAGE]);

      expect(result.get(PAGE_DASHLESS)).toBe(MAIN);
      expect(mocks.queries).toHaveLength(3);
    }
  });

  it('breaks a tie in votes on content, and a full tie on the id', async () => {
    const A = 'a0000000000000000000000000000001';
    const B = 'b0000000000000000000000000000002';
    const counts = (contentA: number, contentB: number) => ({
      v0: { totalCount: 0 },
      s0: { valuesConnection: { totalCount: contentB }, relationsConnection: { totalCount: 0 } },
      v1: { totalCount: 0 },
      s1: { valuesConnection: { totalCount: contentA }, relationsConnection: { totalCount: 0 } },
    });
    const respond = (contentA: number, contentB: number) => [
      { entities: [{ id: PAGE_DASHLESS, spaceIds: [B, A] }] },
      { spaces: [B, A].map(id => ({ id, type: 'PERSONAL', page: { id: PAGE_DASHLESS } })) },
      counts(contentA, contentB),
    ];

    mocks.responses = respond(1, 5);
    expect((await fetchPersonalSpacesByPageIds([PAGE])).get(PAGE_DASHLESS)).toBe(B);

    mocks.responses = respond(3, 3);
    expect((await fetchPersonalSpacesByPageIds([PAGE])).get(PAGE_DASHLESS)).toBe(A);
  });

  it('still resolves a contested person when the activity read fails', async () => {
    const A = 'a0000000000000000000000000000001';
    const B = 'b0000000000000000000000000000002';
    mocks.respond = (query: string) => {
      if (query.includes('entities')) return { entities: [{ id: PAGE_DASHLESS, spaceIds: [B, A] }] };
      if (query.includes('spaces('))
        return { spaces: [B, A].map(id => ({ id, type: 'PERSONAL', page: { id: PAGE_DASHLESS } })) };
      throw new Error('activity read failed');
    };

    const result = await fetchPersonalSpacesByPageIds([PAGE]);

    expect(result.get(PAGE_DASHLESS)).toBe(A);
  });

  it('reads no activity for someone with a single personal space', async () => {
    mocks.responses = [
      { entities: [{ id: PAGE_DASHLESS, spaceIds: [PERSONAL] }] },
      { spaces: [{ id: PERSONAL, type: 'PERSONAL', page: { id: PAGE_DASHLESS } }] },
    ];

    await fetchPersonalSpacesByPageIds([PAGE]);

    expect(mocks.queries).toHaveLength(2);
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

  // The API answers an `in` filter with at most 100 rows unless `first` asks for more — silently,
  // with no error. Measured against testnet: 150 ids in, 100 rows out.
  it('resolves everyone past the default page size, in both reads', async () => {
    const pages = Array.from({ length: 150 }, (_, i) => i.toString(16).padStart(32, 'a'));
    const spaceOf = (page: string) => page.replace(/^a/, 'b');
    const pageOf = (space: string) => space.replace(/^b/, 'a');
    const idsIn = (query: string) => JSON.parse(query.match(/in: (\[.*?\])/)![1]) as string[];
    const limit = (query: string) => Number(query.match(/first: (\d+)/)?.[1] ?? 100);
    mocks.respond = (query: string) => {
      const ids = idsIn(query).slice(0, limit(query));
      return query.includes('entities')
        ? { entities: ids.map(id => ({ id, spaceIds: [spaceOf(id)] })) }
        : { spaces: ids.map(id => ({ id, type: 'PERSONAL', page: { id: pageOf(id) } })) };
    };

    const result = await fetchPersonalSpacesByPageIds(pages);

    expect(result.size).toBe(150);
    expect(result.get(pages[149])).toBe(spaceOf(pages[149]));
  });
});
