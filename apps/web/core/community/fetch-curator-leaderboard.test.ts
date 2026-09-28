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
  debates: [] as { id: string }[],
  debateParticipants: [] as { fromEntityId: string; toEntityId: string }[],
  profileSpaceIds: [] as string[][],
}));

// The real query plumbing is covered by community-graphql.test.ts; these stubs stand in for the
// indexer so the aggregation above them can be driven directly. Everything else stays real.
vi.mock('./community-graphql', async importOriginal => {
  const actual = await importOriginal<typeof import('./community-graphql')>();

  return {
    ...actual,
    // Every label is answered explicitly, and an unrecognised one throws rather than falling back
    // to an empty result. A new query added to the fetcher would otherwise be answered with
    // "nothing", quietly narrowing what these tests cover while they carried on passing.
    runQuery: async (label: string) => {
      switch (label) {
        case 'space ranking blocks':
          return { entitiesConnection: { nodes: [{ id: RANKING_BLOCK }] } };
        // Reached only when the fixtures above give them something to look up, which they don't.
        case 'bounty-linked proposals':
        case 'news story edit versions':
          return null;
        default:
          throw new Error(`unstubbed community query: "${label}"`);
      }
    },
    collectConnection: async (label: string) => {
      switch (label) {
        case 'submitted to ranking block relations':
          return { nodes: mocks.rankingRelations, truncated: false, totalCount: mocks.rankingRelations.length };
        case 'user votes':
          return { nodes: mocks.votes, truncated: false };
        case 'debate entities':
          return { nodes: mocks.debates, truncated: false, totalCount: mocks.debates.length };
        case 'debate participant relations':
          return { nodes: mocks.debateParticipants, truncated: false, totalCount: mocks.debateParticipants.length };
        case 'bounty links':
        case 'news story entities':
        case 'news story type relation versions':
          return { nodes: [], truncated: false, totalCount: 0 };
        default:
          throw new Error(`unstubbed community connection: "${label}"`);
      }
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
  mocks.debates = [];
  mocks.debateParticipants = [];
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

  /**
   * Debates count appearances, either side, through the side-agnostic `Participants` relation.
   */
  it('counts a debate for both of its participants', async () => {
    mocks.debates = [{ id: 'debate-1' }];
    mocks.debateParticipants = [
      { fromEntityId: 'debate-1', toEntityId: KEEPER },
      { fromEntityId: 'debate-1', toEntityId: OTHER },
    ];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.rows.find(row => row.curatorSpaceId === KEEPER)?.debates).toBe(1);
    expect(result.rows.find(row => row.curatorSpaceId === OTHER)?.debates).toBe(1);
  });

  /**
   * Once per debate per curator, however many Participants relations say so.
   */
  it('counts a debate once for a curator named on it more than once', async () => {
    mocks.debates = [{ id: 'debate-1' }];
    mocks.debateParticipants = [
      { fromEntityId: 'debate-1', toEntityId: KEEPER },
      { fromEntityId: 'debate-1', toEntityId: KEEPER },
    ];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.rows.find(row => row.curatorSpaceId === KEEPER)?.debates).toBe(1);
  });

  /**
   * The box counts the space's debates; the column counts appearances in them. One debate has two
   * participants, so summing the column would report every debate twice and disagree with the board
   * directly beneath it.
   */
  it('reports the space’s debates in the metrics, not the sum of the column', async () => {
    mocks.debates = [{ id: 'debate-1' }];
    mocks.debateParticipants = [
      { fromEntityId: 'debate-1', toEntityId: KEEPER },
      { fromEntityId: 'debate-1', toEntityId: OTHER },
    ];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.metrics.debates).toBe(1);
    expect(result.rows.reduce((total, row) => total + row.debates, 0)).toBe(2);
  });

  // Displayed, not scored — as votes are. Folding it in would re-rank every curator the day it
  // shipped, moving people who had done nothing.
  it('leaves debates out of the score the board is ordered by', async () => {
    mocks.rankingRelations = [ranking(OTHER, 1)];
    mocks.debates = [{ id: 'debate-1' }];
    mocks.debateParticipants = [{ fromEntityId: 'debate-1', toEntityId: KEEPER }];

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    const keeper = result.rows.find(row => row.curatorSpaceId === KEEPER);
    expect(keeper?.debates).toBe(1);
    expect(keeper?.activityScore).toBe(0);
    // So one ranking still outranks one debate.
    expect(result.rows[0]?.curatorSpaceId).toBe(OTHER);
  });

  it('returns the whole ranked board, not a top slice of it', async () => {
    const curators = Array.from(
      { length: 9 },
      (_, index) => `019fedae72b67ab2927adf044d57c${(600 + index).toString(16)}`
    );

    mocks.rankingRelations = curators.flatMap((curator, index) =>
      Array.from({ length: 9 - index }, (_, n) => ranking(curator, n))
    );

    const result = await fetchCuratorLeaderboard({ spaceId: SPACE, period: 'all' });

    expect(result.rows).toHaveLength(curators.length);
    expect(result.metrics.activeCurators).toBe(curators.length);
    expect(result.rows.map(row => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
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
