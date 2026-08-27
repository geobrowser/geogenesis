import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LEGACY_RANKING_END_DATE_PROPERTY_ID,
  LEGACY_RANKING_START_DATE_PROPERTY_ID,
  RANKING_END_TIME_PROPERTY_ID,
  RANKING_START_TIME_PROPERTY_ID,
} from '~/core/ranking-block-ids';

import { fetchFeaturedRankings } from './fetch-featured-rankings';

const getAllEntitiesMock = vi.fn();
const getBatchEntitiesMock = vi.fn();
const getRelationsByToEntityIdsMock = vi.fn();
const getSpacesMock = vi.fn();
const getSubmitterRefsMock = vi.fn();
const getSubmissionCountMock = vi.fn();
const getOrderedRelationTargetIdsMock = vi.fn();
const reportErrorMock = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getAllEntities: (...args: unknown[]) => getAllEntitiesMock(...args),
  getBatchEntities: (...args: unknown[]) => getBatchEntitiesMock(...args),
  getRelationsByToEntityIds: (...args: unknown[]) => getRelationsByToEntityIdsMock(...args),
  getSpaces: (...args: unknown[]) => getSpacesMock(...args),
}));

vi.mock('~/core/telemetry/logger', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

vi.mock('~/core/blocks/ranking/ranking-block-relations', () => ({
  getAggregatedRankingSubmitterRefs: (...args: unknown[]) => getSubmitterRefsMock(...args),
  getAggregatedRankingSubmissionCount: (...args: unknown[]) => getSubmissionCountMock(...args),
  getOrderedRelationTargetIds: (...args: unknown[]) => getOrderedRelationTargetIdsMock(...args),
}));

const BLOCK = 'cb5afff8d4f04436ab8110c238008926';
const SPACE = '12197ff1db6496c2e817149a7413f7c9';
const PARENT = 'cf8b61c026c047c48683fd2b7e309311';
const RELATION = 'rel1cb5afff8d4f04436ab8110c2380089';
const SUBMITTER_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const RANK_ENTITY = 'r1c9f267dcb0d270718c2a3c45a64afd3';
const HOME_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';

// Far outside any real "now" so getRankingPeriodState is deterministic.
const PAST = '2000-01-01';
const FUTURE = '2999-01-01';

function dateValue(propertyId: string, value: string) {
  return { property: { id: propertyId }, spaceId: SPACE, isDeleted: false, value };
}

// A block entity whose values place the ranking within [startDate, endDate]. The fetcher reads
// these through the batched entity lookup, so the fixture is a plain Entity rather than the page
// wrapper the per-block version used.
function blockEntity({
  name = 'Best Pizza',
  startDate,
  endDate,
  legacy = false,
}: {
  name?: string;
  startDate?: string;
  endDate?: string;
  legacy?: boolean;
}) {
  const startProperty = legacy ? LEGACY_RANKING_START_DATE_PROPERTY_ID : RANKING_START_TIME_PROPERTY_ID;
  const endProperty = legacy ? LEGACY_RANKING_END_DATE_PROPERTY_ID : RANKING_END_TIME_PROPERTY_ID;
  const values = [];
  if (startDate) values.push(dateValue(startProperty, startDate));
  if (endDate) values.push(dateValue(endProperty, endDate));
  return { id: BLOCK, name, values, relations: [], spaces: [SPACE] };
}

function blocksRelation() {
  return [{ id: RELATION, fromEntityId: PARENT, toEntityId: BLOCK, spaceId: SPACE }];
}

describe('fetchFeaturedRankings', () => {
  beforeEach(() => {
    getAllEntitiesMock.mockReset();
    getBatchEntitiesMock.mockReset();
    getRelationsByToEntityIdsMock.mockReset();
    getSpacesMock.mockReset();
    getSubmitterRefsMock.mockReset();
    getSubmissionCountMock.mockReset();
    getOrderedRelationTargetIdsMock.mockReset();
    reportErrorMock.mockReset();

    // Sensible happy-path defaults; individual tests override as needed.
    getAllEntitiesMock.mockReturnValue(Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] }));
    getRelationsByToEntityIdsMock.mockReturnValue(Effect.succeed(blocksRelation()));
    getSpacesMock.mockReturnValue(Effect.succeed([]));
    getSubmitterRefsMock.mockReturnValue([{ rankEntityId: RANK_ENTITY, spaceId: SUBMITTER_SPACE }]);
    getSubmissionCountMock.mockReturnValue(3);
    getOrderedRelationTargetIdsMock.mockReturnValue([]);
  });

  it('keeps a live ranking and resolves its space/block/parent coordinates and submitters', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: FUTURE })]));

    const result = await fetchFeaturedRankings();

    expect(result).toEqual([
      {
        blockEntityId: BLOCK,
        spaceId: SPACE,
        parentEntityId: PARENT,
        relationId: RELATION,
        name: 'Best Pizza',
        rankingStartDate: PAST,
        rankingEndDate: FUTURE,
        submitterSpaceIds: [SUBMITTER_SPACE],
        submissionCount: 3,
        spaceName: null,
        spaceImage: null,
        topEntries: [],
      },
    ]);
  });

  it('resolves leaderboard top entries in standings order and attaches space metadata', async () => {
    const FIRST = 'e1c9f267dcb0d270718c2a3c45a64afd';
    const SECOND = 'e2c9f267dcb0d270718c2a3c45a64afd';

    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: FUTURE })]));
    getOrderedRelationTargetIdsMock.mockReturnValue([FIRST, SECOND]);
    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) {
        // Returned out of order — the fetcher must re-order to the standings.
        return Effect.succeed({
          entities: [
            { id: SECOND, name: 'Rome', relations: [] },
            { id: FIRST, name: 'Paris', relations: [] },
          ],
        });
      }
      return Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] });
    });
    getSpacesMock.mockReturnValue(
      Effect.succeed([{ id: SPACE, entity: { name: 'Travel', image: 'ipfs://space-image' } }])
    );

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].topEntries).toEqual([
      { entityId: FIRST, name: 'Paris', image: null },
      { entityId: SECOND, name: 'Rome', image: null },
    ]);
    expect(result[0].spaceName).toBe('Travel');
    expect(result[0].spaceImage).toBe('ipfs://space-image');
  });

  it('still returns the ranking (without a leaderboard) when the top-entries lookup fails', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: FUTURE })]));
    getOrderedRelationTargetIdsMock.mockReturnValue(['e1c9f267dcb0d270718c2a3c45a64afd']);
    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) {
        return Effect.die(new Error('entities lookup down'));
      }
      return Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] });
    });

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].topEntries).toEqual([]);
  });

  it('still returns rankings when the space metadata lookup fails', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: FUTURE })]));
    getSpacesMock.mockImplementation(() => Effect.die(new Error('boom')));

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].spaceName).toBeNull();
    expect(result[0].spaceImage).toBeNull();
  });

  it('resolves the window from the legacy date properties when the current ones are absent', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: FUTURE, legacy: true })]));

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].rankingStartDate).toBe(PAST);
    expect(result[0].rankingEndDate).toBe(FUTURE);
  });

  it('treats a ranking with no date window as live', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].rankingStartDate).toBe('');
    expect(result[0].rankingEndDate).toBe('');
  });

  it('drops a ranking whose voting window has already ended', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: PAST })]));

    expect(await fetchFeaturedRankings()).toEqual([]);
  });

  it('drops a live ranking whose block placement cannot be resolved', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: FUTURE })]));
    getRelationsByToEntityIdsMock.mockReturnValue(Effect.succeed([]));

    expect(await fetchFeaturedRankings()).toEqual([]);
  });

  it('falls back to the rank entity home space when a submitter ref lacks a space', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({ startDate: PAST, endDate: FUTURE })]));
    // Ref has no space of its own — the resolver must look up the rank entity's home space.
    getSubmitterRefsMock.mockReturnValue([{ rankEntityId: RANK_ENTITY, spaceId: undefined }]);
    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) {
        return Effect.succeed({ entities: [{ id: RANK_ENTITY, spaces: [HOME_SPACE] }] });
      }
      return Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] });
    });

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].submitterSpaceIds).toEqual([HOME_SPACE]);
  });

  it('returns [] when there are no featured candidates', async () => {
    getAllEntitiesMock.mockReturnValue(Effect.succeed({ entities: [] }));

    expect(await fetchFeaturedRankings()).toEqual([]);
    expect(getBatchEntitiesMock).not.toHaveBeenCalled();
  });
  // ---------------------------------------------------------------------------------------
  // Batching-specific. A per-block loop got these for free; resolving in batches has to do
  // them deliberately, and getting them wrong is silent.
  // ---------------------------------------------------------------------------------------

  const BLOCK_B = 'b2c9f267dcb0d270718c2a3c45a64afd';
  const SPACE_B = '89bd89bf28ff8a0963faf92a8c905e20';
  const PARENT_B = 'p2c9f267dcb0d270718c2a3c45a64afd';

  function twoBlocksInDifferentSpaces() {
    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) return Effect.succeed({ entities: [] });
      return Effect.succeed({
        entities: [
          { id: BLOCK, spaces: [SPACE] },
          { id: BLOCK_B, spaces: [SPACE_B] },
        ],
      });
    });
    getBatchEntitiesMock.mockImplementation((ids: string[], spaceId?: string) =>
      Effect.succeed(
        spaceId === SPACE_B
          ? [{ id: BLOCK_B, name: 'Best Pasta', values: [], relations: [], spaces: [SPACE_B] }]
          : [blockEntity({})]
      )
    );
    getRelationsByToEntityIdsMock.mockReturnValue(
      Effect.succeed([
        { id: RELATION, fromEntityId: PARENT, toEntityId: BLOCK, spaceId: SPACE },
        { id: 'rel2', fromEntityId: PARENT_B, toEntityId: BLOCK_B, spaceId: SPACE_B },
      ])
    );
  }

  it('resolves placements for every block in a single query', async () => {
    twoBlocksInDifferentSpaces();

    const result = await fetchFeaturedRankings();

    expect(result.map(r => r.blockEntityId)).toEqual([BLOCK, BLOCK_B]);
    expect(result.map(r => r.parentEntityId)).toEqual([PARENT, PARENT_B]);

    // The point of the change: one placement call carrying every block, not one call per block.
    expect(getRelationsByToEntityIdsMock).toHaveBeenCalledTimes(1);
    expect(getRelationsByToEntityIdsMock.mock.calls[0][0]).toEqual([BLOCK, BLOCK_B]);
    // And one entity call per distinct space rather than per block.
    expect(getBatchEntitiesMock).toHaveBeenCalledTimes(2);
  });

  it('takes each placement from the block\'s own space, not whichever the batch returned first', async () => {
    // Dropping the per-query space filter widens the response to every space, so a block that is
    // also embedded elsewhere can come back with a foreign placement listed first. The per-block
    // query could never do that; here it has to be excluded by hand.
    getRelationsByToEntityIdsMock.mockReturnValue(
      Effect.succeed([
        { id: 'rel-other-space', fromEntityId: 'parent-elsewhere', toEntityId: BLOCK, spaceId: SPACE_B },
        { id: RELATION, fromEntityId: PARENT, toEntityId: BLOCK, spaceId: SPACE },
      ])
    );
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].parentEntityId).toBe(PARENT);
    expect(result[0].relationId).toBe(RELATION);
  });

  it('drops only the ranking whose placement is in another space', async () => {
    getRelationsByToEntityIdsMock.mockReturnValue(
      Effect.succeed([{ id: 'rel-elsewhere', fromEntityId: 'parent-elsewhere', toEntityId: BLOCK, spaceId: SPACE_B }])
    );
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));

    expect(await fetchFeaturedRankings()).toEqual([]);
  });

  it('keeps one space\'s entity lookup failing from dropping another space\'s rankings', async () => {
    twoBlocksInDifferentSpaces();
    // Batching makes a failure shared by default. It has to stay scoped to the space that failed.
    getBatchEntitiesMock.mockImplementation((ids: string[], spaceId?: string) =>
      spaceId === SPACE_B ? Effect.die(new Error('space B is down')) : Effect.succeed([blockEntity({})])
    );

    const result = await fetchFeaturedRankings();

    expect(result.map(r => r.blockEntityId)).toEqual([BLOCK]);
  });

  it('returns nothing when the shared placement query fails', async () => {
    // Every ranking needs a placement, so this drops them all — same as the per-block version,
    // where the throw reached each ranking's own catch.
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));
    getRelationsByToEntityIdsMock.mockImplementation(() => Effect.die(new Error('relations down')));

    expect(await fetchFeaturedRankings()).toEqual([]);
  });

  it('still returns rankings when the shared submitter-home-space lookup fails', async () => {
    // Softer than the per-ranking version it replaces, deliberately: that one let the failure drop
    // the ranking, and one shared batch failing that way would now drop every featured ranking.
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));
    getSubmitterRefsMock.mockReturnValue([{ rankEntityId: RANK_ENTITY, spaceId: undefined }]);
    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) return Effect.die(new Error('home space lookup down'));
      return Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] });
    });

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].submitterSpaceIds).toEqual([]);
  });
  it('bounds how many per-space queries are in flight at once', async () => {
    // Batching removed the per-ranking fan-out but not the per-space one: rankings can span as
    // many spaces as there are candidates, and both the block-entity and leaderboard phases issue
    // one query per space. Unbounded, that puts ~MAX_CANDIDATES heavy queries in flight at once.
    const SPACES = Array.from({ length: 12 }, (_, i) => `space${String(i).padStart(27, '0')}x`);
    const BLOCKS = Array.from({ length: 12 }, (_, i) => `block${String(i).padStart(27, '0')}x`);

    let inFlight = 0;
    let peak = 0;

    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) return Effect.succeed({ entities: [] });
      return Effect.succeed({ entities: BLOCKS.map((id, i) => ({ id, spaces: [SPACES[i]] })) });
    });

    getBatchEntitiesMock.mockImplementation((ids: string[], spaceId?: string) =>
      Effect.promise(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        const index = SPACES.indexOf(spaceId ?? '');
        return index === -1 ? [] : [{ id: BLOCKS[index], name: 'R', values: [], relations: [], spaces: [spaceId] }];
      })
    );

    getRelationsByToEntityIdsMock.mockReturnValue(
      Effect.succeed(BLOCKS.map((id, i) => ({ id: `rel${i}`, fromEntityId: `parent${i}`, toEntityId: id, spaceId: SPACES[i] })))
    );

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(10); // MAX_FEATURED_RANKINGS
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1); // still concurrent, not accidentally serialised
  });
  it('reports a swallowed submitter-home-space failure rather than only logging it', async () => {
    // This is the degradation with no user-visible symptom: the old failure removed a card, which
    // someone would eventually notice; fewer "Ranked by" avatars is not something anyone reports.
    // A server log nobody has a reason to read is not a substitute for that, so the swallow has to
    // reach telemetry or the path can fail indefinitely without anyone finding out.
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));
    getSubmitterRefsMock.mockReturnValue([{ rankEntityId: RANK_ENTITY, spaceId: undefined }]);
    const failure = new Error('home space lookup down');
    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) return Effect.die(failure);
      return Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] });
    });

    const result = await fetchFeaturedRankings();

    // Still degrades rather than dropping the card...
    expect(result).toHaveLength(1);
    expect(result[0].submitterSpaceIds).toEqual([]);
    // ...but does not do so silently.
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it('reports a swallowed leaderboard failure', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));
    getOrderedRelationTargetIdsMock.mockReturnValue(['e1c9f267dcb0d270718c2a3c45a64afd']);
    getAllEntitiesMock.mockImplementation((opts: { filter?: { id?: { in?: string[] } } }) => {
      if (opts.filter?.id?.in) return Effect.die(new Error('entities lookup down'));
      return Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] });
    });

    const result = await fetchFeaturedRankings();

    expect(result[0].topEntries).toEqual([]);
    expect(reportErrorMock).toHaveBeenCalled();
  });

  it('reports the placement failure that empties the whole section', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));
    getRelationsByToEntityIdsMock.mockImplementation(() => Effect.die(new Error('relations down')));

    expect(await fetchFeaturedRankings()).toEqual([]);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it('reports nothing on the happy path', async () => {
    getBatchEntitiesMock.mockReturnValue(Effect.succeed([blockEntity({})]));

    await fetchFeaturedRankings();

    expect(reportErrorMock).not.toHaveBeenCalled();
  });
});
