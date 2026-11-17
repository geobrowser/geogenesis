import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downvotedSpaceIds,
  fetchMemberDebateDownvotes,
  fetchMemberDebateVotes,
  fetchMemberDownvotesOn,
} from './fetch-member-debate-votes';

type Node = { objectId: string | null; spaceId: string | null; voteType: number; votedAt: string };
type VotePage = { nodes: Node[]; hasNextPage: boolean; endCursor: string | null };

const mocks = vi.hoisted(() => ({
  voteCalls: [] as Array<{ filter: Record<string, unknown>; after: string | null | undefined }>,
  typeCalls: [] as string[][],
  pages: [] as VotePage[],
  debateIds: new Set<string>(),
}));

vi.mock('~/core/io/graphql-client', async () => {
  const { Effect } = await import('effect');
  return {
    graphql: ({
      variables,
      decoder,
    }: {
      variables: { filter?: Record<string, unknown>; after?: string | null; ids?: string[]; typeId?: string };
      decoder: (data: unknown) => unknown;
    }) => {
      if (variables.typeId) {
        mocks.typeCalls.push(variables.ids ?? []);
        return Effect.succeed(
          decoder({ entities: (variables.ids ?? []).filter(id => mocks.debateIds.has(id)).map(id => ({ id })) })
        );
      }
      mocks.voteCalls.push({ filter: variables.filter ?? {}, after: variables.after });
      const page = mocks.pages[mocks.voteCalls.length - 1] ?? { nodes: [], hasNextPage: false, endCursor: null };
      return Effect.succeed(
        decoder({
          userVotesConnection: {
            pageInfo: { hasNextPage: page.hasNextPage, endCursor: page.endCursor },
            nodes: page.nodes,
          },
        })
      );
    },
  };
});

const MEMBER = 'd4bee0928fb5405baba3b1513f085835';
const S1 = '11111111111111111111111111111111';
const S2 = '22222222222222222222222222222222';
const D1 = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';
const SINCE = 1_790_000_000;
const SINCE_ISO = new Date(SINCE * 1000).toISOString();

const claimId = (n: number) => n.toString(16).padStart(32, 'c');

beforeEach(() => {
  mocks.voteCalls = [];
  mocks.typeCalls = [];
  mocks.pages = [];
  mocks.debateIds = new Set([D1]);
});

describe('fetchMemberDebateDownvotes', () => {
  it('reads nothing before push-down has launched', async () => {
    await expect(fetchMemberDebateDownvotes(MEMBER, { since: null })).resolves.toEqual([]);
    expect(mocks.voteCalls).toHaveLength(0);
  });

  it('asks only for curation downvotes cast since the launch', async () => {
    mocks.pages = [{ nodes: [], hasNextPage: false, endCursor: null }];
    await fetchMemberDebateDownvotes(MEMBER, { since: SINCE });
    expect(mocks.voteCalls[0].filter).toEqual({
      userId: { is: MEMBER },
      voteType: { is: 1 },
      voteKind: { is: 0 },
      objectType: { is: 0 },
      votedAt: { greaterThanOrEqualTo: SINCE_ISO },
    });
  });

  it('finds a debate push-down behind 1,000+ newer downvotes on claims', async () => {
    const claimPage = (offset: number, cursor: string | null): VotePage => ({
      nodes: Array.from({ length: 500 }, (_, i) => ({
        objectId: claimId(offset + i),
        spaceId: S1,
        voteType: 1,
        votedAt: '2026-11-10T00:00:00Z',
      })),
      hasNextPage: true,
      endCursor: cursor,
    });
    mocks.pages = [
      claimPage(0, 'c1'),
      claimPage(500, 'c2'),
      claimPage(1000, 'c3'),
      {
        nodes: [{ objectId: D1, spaceId: S2, voteType: 1, votedAt: '2026-11-01T00:00:00Z' }],
        hasNextPage: false,
        endCursor: null,
      },
    ];

    const records = await fetchMemberDebateDownvotes(MEMBER, { since: SINCE });

    expect(mocks.voteCalls.map(call => call.after)).toEqual([null, 'c1', 'c2', 'c3']);
    // Narrowed to debates page by page, never truncated first.
    expect(mocks.typeCalls).toHaveLength(4);
    expect(records.map(record => [record.objectId, record.spaceId])).toEqual([[D1, S2]]);
  });
});

describe('fetchMemberDownvotesOn', () => {
  it('reads a ballot’s debates in one request, bounded by the launch', async () => {
    mocks.pages = [
      {
        nodes: [{ objectId: D1, spaceId: S1, voteType: 1, votedAt: '2026-11-02' }],
        hasNextPage: false,
        endCursor: null,
      },
    ];
    const records = await fetchMemberDownvotesOn(MEMBER, [D1, claimId(1)], { since: SINCE });
    expect(mocks.voteCalls).toHaveLength(1);
    expect(mocks.voteCalls[0].filter).toMatchObject({
      objectId: { in: [D1, claimId(1)] },
      voteType: { is: 1 },
      votedAt: { greaterThanOrEqualTo: SINCE_ISO },
    });
    expect(records).toHaveLength(1);
  });

  it('reads nothing before push-down has launched', async () => {
    await expect(fetchMemberDownvotesOn(MEMBER, [D1], { since: null })).resolves.toEqual([]);
    expect(mocks.voteCalls).toHaveLength(0);
  });
});

describe('fetchMemberDebateVotes', () => {
  it('reads every space’s vote on one debate, since the launch when given', async () => {
    mocks.pages = [
      {
        nodes: [
          { objectId: D1, spaceId: S1, voteType: 1, votedAt: '2026-11-02' },
          { objectId: D1, spaceId: S2, voteType: 0, votedAt: '2026-11-01' },
        ],
        hasNextPage: false,
        endCursor: null,
      },
    ];

    const records = await fetchMemberDebateVotes(MEMBER, D1, { since: SINCE });

    expect(mocks.voteCalls[0].filter).toEqual({
      userId: { is: MEMBER },
      objectId: { is: D1 },
      voteKind: { is: 0 },
      objectType: { is: 0 },
      votedAt: { greaterThanOrEqualTo: SINCE_ISO },
    });
    expect(downvotedSpaceIds(records)).toEqual([S1]);
  });
});
