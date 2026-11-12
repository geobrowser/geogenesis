import { describe, expect, it, vi } from 'vitest';

import { downvotedSpaceIds, fetchMemberCurationDownvotes, fetchMemberDebateVotes } from './fetch-member-debate-votes';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ filter: Record<string, unknown>; after: string | null | undefined }>,
  pages: [] as Array<{
    nodes: Array<{ objectId: string | null; spaceId: string | null; voteType: number; votedAt: string }>;
    hasNextPage: boolean;
    endCursor: string | null;
  }>,
}));

vi.mock('~/core/io/graphql-client', async () => {
  const { Effect } = await import('effect');
  return {
    graphql: ({
      variables,
      decoder,
    }: {
      variables: { filter: Record<string, unknown>; after?: string | null };
      decoder: (data: unknown) => unknown;
    }) => {
      mocks.calls.push({ filter: variables.filter, after: variables.after });
      const page = mocks.pages[mocks.calls.length - 1];
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

describe('fetchMemberCurationDownvotes', () => {
  it('pages with cursors until the server runs out, and asks only for curation downvotes', async () => {
    mocks.calls = [];
    mocks.pages = [
      {
        nodes: [{ objectId: D1, spaceId: S1, voteType: 1, votedAt: '2026-11-02' }],
        hasNextPage: true,
        endCursor: 'c1',
      },
      {
        nodes: [{ objectId: D1, spaceId: S2, voteType: 1, votedAt: '2026-11-01' }],
        hasNextPage: true,
        endCursor: 'c2',
      },
      {
        nodes: [{ objectId: null, spaceId: S2, voteType: 1, votedAt: '2026-10-01' }],
        hasNextPage: false,
        endCursor: null,
      },
    ];

    const records = await fetchMemberCurationDownvotes(MEMBER);

    expect(mocks.calls.map(call => call.after)).toEqual([null, 'c1', 'c2']);
    expect(mocks.calls[0].filter).toEqual({
      userId: { is: MEMBER },
      voteType: { is: 1 },
      voteKind: { is: 0 },
      objectType: { is: 0 },
    });
    expect(records.map(record => [record.objectId, record.spaceId, record.direction])).toEqual([
      [D1, S1, 'negative'],
      [D1, S2, 'negative'],
    ]);
  });
});

describe('fetchMemberDebateVotes', () => {
  it('reads every space’s vote on one debate', async () => {
    mocks.calls = [];
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

    const records = await fetchMemberDebateVotes(MEMBER, D1);

    expect(mocks.calls[0].filter).toEqual({
      userId: { is: MEMBER },
      objectId: { is: D1 },
      voteKind: { is: 0 },
      objectType: { is: 0 },
    });
    expect(downvotedSpaceIds(records)).toEqual([S1]);
  });
});
