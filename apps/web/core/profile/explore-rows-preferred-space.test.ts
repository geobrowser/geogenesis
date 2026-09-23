import { describe, expect, it, vi } from 'vitest';

const PERSONAL = 'cc31e40f74231d530f1b5d0fc1cd94d8';
const RELATIONSHIPS = '224406e0de3c48d78ef12774111b8b2f';
const CLAIM = '55a58477798a4e4e971f2c7a3dcc10df';

/** The allowed set handed to the row builder, per call. */
const allowedSets: Set<string>[] = [];

vi.mock('~/core/io/graphql-client', () => ({ graphql: () => undefined }));

vi.mock('effect', () => ({
  Effect: {
    runPromise: async () => [{ id: CLAIM, spaces: [PERSONAL, RELATIONSHIPS], relations: [], values: [] }],
  },
}));

vi.mock('~/core/explore/explore-card-item', () => ({
  buildExploreFeedRows: (_entities: unknown[], allowed: Set<string>) => {
    allowedSets.push(allowed);
    return [];
  },
  decodeExploreCardEntity: (node: unknown) => node,
}));

vi.mock('~/core/explore/explore-card-selection', () => ({
  exploreCardNodeFields: () => 'id',
  exploreCardPropertyFragment: () => '',
}));

const { fetchExploreRowsByIds } = await import('./explore-rows-by-ids');

/**
 * The caller's spaces actually reach the row builder (GEO-2859).
 *
 * `pickDisplaySpaceId` chooses between the spaces it is *allowed*, so a
 * preference that is silently dropped on the way in cannot be seen to fail —
 * the card simply renders in the entity's first space, which is what it did
 * before anyone asked for a preference at all. That is the failure mode this
 * pins: the candidates arrive, and all of them do.
 */
describe('the spaces a caller prefers', () => {
  it('passes every candidate through, not just the first', async () => {
    allowedSets.length = 0;

    await fetchExploreRowsByIds([CLAIM], undefined, new Map([[CLAIM, [PERSONAL, RELATIONSHIPS]]]));

    expect([...allowedSets[0]].sort()).toEqual([RELATIONSHIPS, PERSONAL].sort());
  });

  it('falls back to the entity’s own spaces when the caller names none', async () => {
    allowedSets.length = 0;

    await fetchExploreRowsByIds([CLAIM], undefined, new Map());

    expect([...allowedSets[0]].sort()).toEqual([RELATIONSHIPS, PERSONAL].sort());
  });

  it('keeps a single named space as the only candidate', async () => {
    allowedSets.length = 0;

    await fetchExploreRowsByIds([CLAIM], undefined, new Map([[CLAIM, [RELATIONSHIPS]]]));

    expect([...allowedSets[0]]).toEqual([RELATIONSHIPS]);
  });
});
