import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Page = { ids: string[]; endCursor: string | null; hasNextPage: boolean };

const mocks = vi.hoisted(() => ({
  pages: [] as Page[],
  calls: [] as { after: string | null }[],
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ decoder, variables }: { decoder: (data: unknown) => unknown; variables: { after: string | null } }) => {
    mocks.calls.push({ after: variables.after });
    const page = mocks.pages[mocks.calls.length - 1] ?? { ids: [], endCursor: null, hasNextPage: false };
    return Effect.succeed(
      decoder({
        entitiesRankedForFeedConnection: {
          pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
          nodes: page.ids.map(id => ({ id })),
        },
      })
    );
  },
}));

const { fetchDebatesBestOrder } = await import('./use-debates-best-order');

beforeEach(() => {
  mocks.pages = [];
  mocks.calls = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('fetchDebatesBestOrder', () => {
  it('returns one page in ranked order', async () => {
    mocks.pages = [{ ids: ['a', 'b', 'c'], endCursor: null, hasNextPage: false }];

    expect(await fetchDebatesBestOrder('space-1')).toEqual(['a', 'b', 'c']);
    expect(mocks.calls).toHaveLength(1);
  });

  // A space larger than one page ranks in full rather than ranking the first page and dropping the
  // rest to the bottom of the scroll.
  it('drains the connection until there is no next page', async () => {
    mocks.pages = [
      { ids: ['a'], endCursor: 'cursor-1', hasNextPage: true },
      { ids: ['b'], endCursor: 'cursor-2', hasNextPage: true },
      { ids: ['c'], endCursor: null, hasNextPage: false },
    ];

    expect(await fetchDebatesBestOrder('space-1')).toEqual(['a', 'b', 'c']);
    expect(mocks.calls.map(call => call.after)).toEqual([null, 'cursor-1', 'cursor-2']);
  });

  // The loop is driven entirely by what the server returns, so it must not rely on the server
  // behaving. A repeated cursor would otherwise page until the cap.
  it('stops when the connection repeats a cursor, and says so', async () => {
    mocks.pages = [
      { ids: ['a'], endCursor: 'same', hasNextPage: true },
      { ids: ['b'], endCursor: 'same', hasNextPage: true },
      { ids: ['c'], endCursor: 'same', hasNextPage: true },
    ];

    expect(await fetchDebatesBestOrder('space-1')).toEqual(['a', 'b']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('repeated a cursor'), expect.anything());
  });

  it('reports reaching the page cap rather than passing off a partial ranking as whole', async () => {
    mocks.pages = Array.from({ length: 60 }, (_, index) => ({
      ids: [`entity-${index}`],
      endCursor: `cursor-${index}`,
      hasNextPage: true,
    }));

    const ids = await fetchDebatesBestOrder('space-1');

    expect(ids).toHaveLength(50);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('page cap'), expect.anything());
  });

  it('treats an empty ranking as no ranking rather than an error', async () => {
    mocks.pages = [{ ids: [], endCursor: null, hasNextPage: false }];

    expect(await fetchDebatesBestOrder('space-1')).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });
});
