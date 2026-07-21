import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RANKING_END_DATE_PROPERTY_ID, RANKING_START_DATE_PROPERTY_ID } from '~/core/ranking-block-ids';

import { fetchFeaturedRankings } from './fetch-featured-rankings';

const getAllEntitiesMock = vi.fn();
const getEntityPageMock = vi.fn();
const getRelationsByToEntityIdsMock = vi.fn();
const getSubmitterRefsMock = vi.fn();
const getSubmissionCountMock = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getAllEntities: (...args: unknown[]) => getAllEntitiesMock(...args),
  getEntityPage: (...args: unknown[]) => getEntityPageMock(...args),
  getRelationsByToEntityIds: (...args: unknown[]) => getRelationsByToEntityIdsMock(...args),
}));

vi.mock('~/core/blocks/ranking/ranking-block-relations', () => ({
  getAggregatedRankingSubmitterRefs: (...args: unknown[]) => getSubmitterRefsMock(...args),
  getAggregatedRankingSubmissionCount: (...args: unknown[]) => getSubmissionCountMock(...args),
  getOrderedRelationTargetIds: () => [],
}));

vi.mock('~/core/blocks/ranking/ranking-entry-pick', () => ({
  pickImage: () => null,
  pickValueBySpace: () => null,
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

// A page whose values place the ranking within [startDate, endDate].
function entityPage({
  name = 'Best Pizza',
  startDate,
  endDate,
}: {
  name?: string;
  startDate?: string;
  endDate?: string;
}) {
  const values = [];
  if (startDate) values.push(dateValue(RANKING_START_DATE_PROPERTY_ID, startDate));
  if (endDate) values.push(dateValue(RANKING_END_DATE_PROPERTY_ID, endDate));
  return { entity: { name, values, relations: [] }, relations: [] };
}

function blocksRelation() {
  return [{ id: RELATION, fromEntityId: PARENT, toEntityId: BLOCK, spaceId: SPACE }];
}

describe('fetchFeaturedRankings', () => {
  beforeEach(() => {
    getAllEntitiesMock.mockReset();
    getEntityPageMock.mockReset();
    getRelationsByToEntityIdsMock.mockReset();
    getSubmitterRefsMock.mockReset();
    getSubmissionCountMock.mockReset();

    // Sensible happy-path defaults; individual tests override as needed.
    getAllEntitiesMock.mockReturnValue(Effect.succeed({ entities: [{ id: BLOCK, spaces: [SPACE] }] }));
    getRelationsByToEntityIdsMock.mockReturnValue(Effect.succeed(blocksRelation()));
    getSubmitterRefsMock.mockReturnValue([{ rankEntityId: RANK_ENTITY, spaceId: SUBMITTER_SPACE }]);
    getSubmissionCountMock.mockReturnValue(3);
  });

  it('keeps a live ranking and resolves its space/block/parent coordinates and submitters', async () => {
    getEntityPageMock.mockReturnValue(Effect.succeed(entityPage({ startDate: PAST, endDate: FUTURE })));

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
        topEntries: [],
      },
    ]);
  });

  it('treats a ranking with no date window as live', async () => {
    getEntityPageMock.mockReturnValue(Effect.succeed(entityPage({})));

    const result = await fetchFeaturedRankings();

    expect(result).toHaveLength(1);
    expect(result[0].rankingStartDate).toBe('');
    expect(result[0].rankingEndDate).toBe('');
  });

  it('drops a ranking whose voting window has already ended', async () => {
    getEntityPageMock.mockReturnValue(Effect.succeed(entityPage({ startDate: PAST, endDate: PAST })));

    expect(await fetchFeaturedRankings()).toEqual([]);
  });

  it('drops a live ranking whose block placement cannot be resolved', async () => {
    getEntityPageMock.mockReturnValue(Effect.succeed(entityPage({ startDate: PAST, endDate: FUTURE })));
    getRelationsByToEntityIdsMock.mockReturnValue(Effect.succeed([]));

    expect(await fetchFeaturedRankings()).toEqual([]);
  });

  it('falls back to the rank entity home space when a submitter ref lacks a space', async () => {
    getEntityPageMock.mockReturnValue(Effect.succeed(entityPage({ startDate: PAST, endDate: FUTURE })));
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
    expect(getEntityPageMock).not.toHaveBeenCalled();
  });
});
