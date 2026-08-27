import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, SearchResult } from '~/core/types';

// The dispatcher reaches the network through `~/core/io/queries`; stub the two
// calls searchGraph makes so each test controls exactly what the index returned
// and how many times we went back for names.
const queries = {
  getResults: vi.fn(),
  getEntityNames: vi.fn(),
  getEntity: vi.fn(),
  getSpace: vi.fn(),
  getSpaces: vi.fn(),
};
vi.mock('~/core/io/queries', () => queries);
vi.mock('~/core/sync/use-sync-engine', () => ({ store: {} }));
vi.mock('~/core/query-client', () => ({ queryClient: {} }));

const { executeSearchGraph } = await import('./read-dispatcher');

// Only the fields searchGraph reads; the real objects carry far more. Ids are
// distinct per hit so the dispatcher's dedup doesn't swallow a fixture.
let nextEntityId = 0;
function remoteHit(name: string, types: { id: string; name?: string | null }[]): SearchResult {
  nextEntityId += 1;
  return {
    id: String(nextEntityId).padStart(32, 'e'),
    name,
    types,
    spaces: [{ spaceId: 'c9f267dcb0d270718c2a3c45a64afd32', name: 'Crypto' }],
  } as unknown as SearchResult;
}

function ctx() {
  return {
    store: { getEntities: () => [] as Entity[], getEntity: () => null },
    // Pass-through cache: no memoisation, so call counts below measure the
    // dispatcher's own batching rather than react-query's.
    cache: {
      fetchQuery: ({ queryFn }: { queryKey: unknown[]; queryFn: (c: { signal: undefined }) => Promise<unknown> }) =>
        queryFn({ signal: undefined }),
    },
    searchSpaceIds: [],
  } as unknown as Parameters<typeof executeSearchGraph>[1];
}

const TOKEN_TYPE = '937b2d16d9394adfa1bf97f58b7a5ec6';
const ASSET_TYPE = 'f8780a80c2384a2a96cb567d88b1aa63';

describe('executeSearchGraph type names', () => {
  beforeEach(() => {
    queries.getResults.mockReset();
    queries.getEntityNames.mockReset();
  });

  it('backfills a type the search index returned without a name', async () => {
    // Exactly what /search returns for Ether: the type that answers "is this a
    // token?" is the one with no name. Dropping it made the agent report a real
    // entity as missing.
    queries.getResults.mockReturnValue(
      Effect.succeed([remoteHit('Ether', [{ id: TOKEN_TYPE }, { id: ASSET_TYPE, name: 'Asset' }])])
    );
    queries.getEntityNames.mockReturnValue(Effect.succeed([{ id: TOKEN_TYPE, name: 'Token' }]));

    const output = await executeSearchGraph({ query: 'Ether' }, ctx());

    expect('results' in output && output.results[0].typeNames).toEqual(['Token', 'Asset']);
  });

  it('asks for every unnamed type across the page in one batched call', async () => {
    queries.getResults.mockReturnValue(
      Effect.succeed([
        remoteHit('Ether', [{ id: TOKEN_TYPE }]),
        remoteHit('Into the Ether', [{ id: '4c81561d1f9541319cdddd20ab831ba2' }]),
      ])
    );
    queries.getEntityNames.mockReturnValue(Effect.succeed([]));

    await executeSearchGraph({ query: 'Ether', limit: 10 }, ctx());

    expect(queries.getEntityNames).toHaveBeenCalledTimes(1);
    expect(queries.getEntityNames.mock.calls[0][0]).toEqual([
      '4c81561d1f9541319cdddd20ab831ba2',
      TOKEN_TYPE,
    ]);
  });

  it('never asks when the index already named every type', async () => {
    queries.getResults.mockReturnValue(Effect.succeed([remoteHit('Ether', [{ id: ASSET_TYPE, name: 'Asset' }])]));

    const output = await executeSearchGraph({ query: 'Ether' }, ctx());

    expect(queries.getEntityNames).not.toHaveBeenCalled();
    expect('results' in output && output.results[0].typeNames).toEqual(['Asset']);
  });

  it('still returns results when the name lookup fails', async () => {
    // An unresolved type is worth less than the search itself — degrading to
    // the names we already have must never turn into `{ error: … }`.
    queries.getResults.mockReturnValue(
      Effect.succeed([remoteHit('Ether', [{ id: TOKEN_TYPE }, { id: ASSET_TYPE, name: 'Asset' }])])
    );
    queries.getEntityNames.mockReturnValue(Effect.fail(new Error('graphql down')));

    const output = await executeSearchGraph({ query: 'Ether' }, ctx());

    expect('results' in output && output.results[0].typeNames).toEqual(['Asset']);
  });

  it('drops a type that has no name anywhere', async () => {
    queries.getResults.mockReturnValue(Effect.succeed([remoteHit('Ether', [{ id: TOKEN_TYPE }])]));
    queries.getEntityNames.mockReturnValue(Effect.succeed([{ id: TOKEN_TYPE, name: null }]));

    const output = await executeSearchGraph({ query: 'Ether' }, ctx());

    expect('results' in output && output.results[0].typeNames).toEqual([]);
  });
});
