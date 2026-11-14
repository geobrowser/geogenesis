import { describe, expect, it, vi } from 'vitest';

import { RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';

import { BallotGradesPendingError } from './fetch-ballot-grades';
import { fetchRankBallot } from './fetch-my-ranking-ballot';

const mocks = vi.hoisted(() => ({ getEntity: vi.fn(), fetchBallotGrades: vi.fn() }));

vi.mock('~/core/io/queries', () => ({ getEntity: mocks.getEntity, getAllEntities: vi.fn() }));
vi.mock('./fetch-ballot-grades', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch-ballot-grades')>()),
  fetchBallotGrades: mocks.fetchBallotGrades,
}));

const RANK = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DEBATE = 'cccccccccccccccccccccccccccccccc';

const rank = (relationId: string, rankType = 'ORDINAL') => ({
  id: RANK,
  name: null,
  description: null,
  spaces: [SPACE],
  types: [],
  values: [{ property: { id: '48e01bc8324e48c2a6c9cab3f49290c6' }, value: rankType, isDeleted: false }],
  relations: [
    {
      id: relationId,
      entityId: relationId,
      type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
      fromEntity: { id: RANK, name: null },
      toEntity: { id: DEBATE, name: null, value: DEBATE },
      renderableType: 'RELATION',
      position: 'a0',
      spaceId: SPACE,
    },
  ],
});

describe('fetchRankBallot with grades (GEO-3729)', () => {
  it('reads the votes again when a publish landed between the votes and the grades', async () => {
    const { Effect } = await import('effect');
    mocks.getEntity
      .mockReturnValueOnce(Effect.succeed(rank('11111111111111111111111111111111')))
      .mockReturnValueOnce(Effect.succeed(rank('22222222222222222222222222222222')));
    mocks.fetchBallotGrades
      .mockRejectedValueOnce(new BallotGradesPendingError(RANK))
      .mockResolvedValueOnce(new Map([[DEBATE, 'A']]));
    const ballot = await fetchRankBallot(RANK, SPACE, { withGrades: true });
    expect(mocks.getEntity).toHaveBeenCalledTimes(2);
    expect(ballot?.grades?.get(DEBATE)).toBe('A');
  });

  it('reads the grades when the Rank type comes back empty, as the entity read decodes it live', async () => {
    const { Effect } = await import('effect');
    mocks.getEntity.mockReset().mockReturnValueOnce(Effect.succeed(rank('11111111111111111111111111111111', '')));
    mocks.fetchBallotGrades.mockReset().mockResolvedValueOnce(new Map([[DEBATE, 'B']]));
    const ballot = await fetchRankBallot(RANK, SPACE, { withGrades: true });
    expect(ballot?.grades?.get(DEBATE)).toBe('B');
  });

  it('reads no grades on a Rank known to be another type', async () => {
    const { Effect } = await import('effect');
    mocks.getEntity.mockReset().mockReturnValueOnce(Effect.succeed(rank('11111111111111111111111111111111', 'WEIGHTED')));
    mocks.fetchBallotGrades.mockReset();
    const ballot = await fetchRankBallot(RANK, SPACE, { withGrades: true });
    expect(ballot?.grades?.size).toBe(0);
    expect(mocks.fetchBallotGrades).not.toHaveBeenCalled();
  });
});
