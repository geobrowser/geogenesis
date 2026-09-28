import { describe, expect, it, vi } from 'vitest';

const requested: string[][] = [];

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ variables }: { variables: { ids: string[] } }) => {
    requested.push(variables.ids);
    // Effect-shaped enough for `Effect.runPromise`: an entity per id asked for.
    return {
      _tag: 'Succeed',
      pipe: () => undefined,
    };
  },
}));

vi.mock('effect', () => ({
  Effect: {
    // The mocked `graphql` already returns the decoded value, so running it is
    // the identity. The decoder is exercised against the real API elsewhere;
    // what this file is about is *how many requests* get made.
    runPromise: async () => [],
  },
}));

vi.mock('~/core/explore/explore-card-item', () => ({
  buildExploreFeedRows: () => [],
  decodeExploreCardEntity: (node: unknown) => node,
}));

vi.mock('~/core/explore/explore-card-selection', () => ({
  exploreCardNodeFields: () => 'id',
  exploreCardPropertyFragment: () => '',
}));

const { fetchExploreRowsByIds } = await import('./explore-rows-by-ids');

/**
 * Every id asked for is actually fetched (GEO-2859).
 *
 * `first` bounds the answer and the callers do not bound the question:
 * `usePersonDebates` hands over everything the relation query found — up to 200
 * — against a page that returned 100. A profile past a hundred debates silently
 * lost cards, and not predictably, because `id: { in: … }` does not preserve
 * input order: the missing one was whichever the index returned last rather than
 * the oldest.
 */
describe('fetchExploreRowsByIds', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => `id-${index}`);

  it('asks nothing for nothing', async () => {
    requested.length = 0;
    await fetchExploreRowsByIds([]);

    expect(requested).toEqual([]);
  });

  it('asks once for a list that fits', async () => {
    requested.length = 0;
    await fetchExploreRowsByIds(ids(100));

    expect(requested).toHaveLength(1);
    expect(requested[0]).toHaveLength(100);
  });

  it('chunks a list that does not fit, and asks for every id', async () => {
    requested.length = 0;
    await fetchExploreRowsByIds(ids(250));

    expect(requested.map(chunk => chunk.length)).toEqual([100, 100, 50]);
    expect(requested.flat()).toHaveLength(250);
  });

  it('covers the debate ceiling the relation query can return', async () => {
    // `fetchPersonDebates` takes up to 200 per side.
    requested.length = 0;
    await fetchExploreRowsByIds(ids(200));

    expect(requested.flat()).toHaveLength(200);
  });
});
