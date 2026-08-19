import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EXCLUDED_CURATOR_SPACE_IDS } from './curator-leaderboard-exclusions';
import { fetchCuratorLeaderboard } from './fetch-curator-leaderboard';

const SPACE = '019fedae72b67ab2927adf044d57c500';
const RANKING_BLOCK = '019fedae72b67ab2927adf044d57c501';
const EXCLUDED = EXCLUDED_CURATOR_SPACE_IDS[0];
const KEEPER = '019fedae72b67ab2927adf044d57c566';
const OTHER = '019fedae72b67ab2927adf044d57c567';

const mocks = vi.hoisted(() => ({
  /** Rows the "submitted to ranking block" connection returns, one per ranking published. */
  rankingRelations: [] as { fromEntityId: string; spaceId: string }[],
  votes: [] as { userId: string }[],
  profileSpaceIds: [] as string[][],
}));

// The real query plumbing is covered by community-graphql.test.ts; these stubs stand in for the
// indexer so the aggregation above them can be driven directly. Everything else stays real.
vi.mock('./community-graphql', async importOriginal => {
  const actual = await importOriginal<typeof import('./community-graphql')>();

  return {
    ...actual,
    runQuery: async (label: string) => {
      if (label === 'space ranking blocks') {
        return { entitiesConnection: { nodes: [{ id: RANKING_BLOCK }] } };
      }
      return null;
    },
    collectConnection: async (label: string) => {
      if (label === 'submitted to ranking block relations') {
        return { nodes: mocks.rankingRelations, truncated: false, totalCount: mocks.rankingRelations.length };
      }
      if (label === 'user votes') {
        return { nodes: mocks.votes, truncated: false };
      }
      return { nodes: [], truncated: false, totalCount: 0 };
    },
  };
});

vi.mock('~/core/io/subgraph/fetch-profile', () => ({
  fetchProfilesBySpaceIds: (spaceIds: string[]) => {
    mocks.profileSpaceIds.push(spaceIds);
    return Effect.succeed(
      spaceIds.map(spaceId => ({ spaceId, name: `Curator ${spaceId.slice(-4)}`, avatarUrl: null }))
    );
  },
}));

function ranking(curatorSpaceId: string, index: number) {
  return { fromEntityId: `${curatorSpaceId}-${index}`, spaceId: curatorSpaceId };
}

beforeEach(() => {
  mocks.rankingRelations = [];
  mocks.votes = [];
  mocks.profileSpaceIds = [];
});

describe('fetchCuratorLeaderboard exclusions', () => {
  // The excluded curator out-publishes everyone, so if the filter misses they lead the board.
  it('leaves an excluded curator off the rows entirely', async () => {
    mocks.rankingRelations = [ranking(EXCLUDED, 1), ranking(EXCLUDED, 2), ranking(EXCLUDED, 3), ranking(KEEPER, 1)];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.rows.map(row => row.curatorSpaceId)).toEqual([KEEPER]);
  });

  it('does not count them among the active curators', async () => {
    mocks.rankingRelations = [ranking(EXCLUDED, 1), ranking(KEEPER, 1), ranking(OTHER, 1)];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.metrics.activeCurators).toBe(2);
  });

  // The space really does hold those rankings, whoever published them — the metric counts content,
  // not who is on the board.
  it('leaves the space-wide totals alone', async () => {
    mocks.rankingRelations = [ranking(EXCLUDED, 1), ranking(EXCLUDED, 2), ranking(KEEPER, 1)];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.metrics.rankings).toBe(3);
  });

  // Votes reach the board through a different source than rankings, so the filter has to sit
  // downstream of all of them rather than in any one.
  it('excludes them however their activity reached the board', async () => {
    mocks.votes = [{ userId: EXCLUDED }, { userId: KEEPER }];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.rows.map(row => row.curatorSpaceId)).toEqual([KEEPER]);
  });

  // Nothing on screen needs their name, so nothing should go and fetch it.
  it('does not look up a profile for them', async () => {
    mocks.rankingRelations = [ranking(EXCLUDED, 1), ranking(KEEPER, 1)];

    await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(mocks.profileSpaceIds.flat()).not.toContain(EXCLUDED);
  });

  // Otherwise the board appends the viewer their own row when they miss the cut — which would show
  // an excluded curator the thing they are excluded from, and with zeroed counts at that.
  it('shows an excluded curator no row of their own', async () => {
    mocks.rankingRelations = [ranking(KEEPER, 1)];

    const result = await fetchCuratorLeaderboard({
      spaceId: SPACE,
      period: 'all',
      currentUserSpaceId: EXCLUDED,
    });

    expect(result.currentUserRow).toBeNull();
    expect(result.rows.some(row => row.isCurrentUser)).toBe(false);
  });

  // The other half of that: an ordinary viewer who missed the cut still gets their row.
  it('still appends a row for a viewer who is not excluded', async () => {
    mocks.rankingRelations = [ranking(KEEPER, 1)];

    const result = await fetchCuratorLeaderboard({
      spaceId: SPACE,
      period: 'all',
      currentUserSpaceId: OTHER,
    });

    expect(result.currentUserRow?.curatorSpaceId).toBe(OTHER);
  });

  it('leaves a board with nobody excluded untouched', async () => {
    mocks.rankingRelations = [ranking(KEEPER, 1), ranking(OTHER, 1)];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.rows.map(row => row.curatorSpaceId).sort()).toEqual([KEEPER, OTHER].sort());
    expect(result.metrics.activeCurators).toBe(2);
  });
});
