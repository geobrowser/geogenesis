import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPendingMembershipSpaceIds } from './fetch-pending-membership-space-ids';

const graphqlMock = vi.fn();
const fetchActiveMemberRequestMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql', bundler: '', chainId: '19411', rpc: '' }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

vi.mock('./fetch-proposed-members', () => ({
  fetchActiveMemberRequest: (spaceId: string, memberSpaceId: string) =>
    fetchActiveMemberRequestMock(spaceId, memberSpaceId),
}));

const MEMBER = 'member00000000000000000000000000';

describe('fetchPendingMembershipSpaceIds', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
    fetchActiveMemberRequestMock.mockReset();
  });

  function mockCandidates(spaceIds: string[]) {
    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      if (query.includes('proposalActionsConnection')) {
        return Effect.succeed({
          proposalActionsConnection: { nodes: spaceIds.map((_, i) => ({ proposalId: `p${i}` })) },
        });
      }
      // proposalsConnection: resolve each proposal to its space (all not-executed).
      return Effect.succeed({
        proposalsConnection: { nodes: spaceIds.map((spaceId, i) => ({ id: `p${i}`, spaceId })) },
      });
    });
  }

  it('keeps only active, not-stuck requests (drops stuck and non-existent)', async () => {
    mockCandidates(['aaaa', 'bbbb', 'cccc']);
    fetchActiveMemberRequestMock.mockImplementation((spaceId: string) => {
      if (spaceId === 'aaaa') return Promise.resolve({ proposalId: 'x', isVotingEnded: false }); // active
      if (spaceId === 'bbbb') return Promise.resolve({ proposalId: 'y', isVotingEnded: true }); // stuck
      return Promise.resolve(null); // no active request
    });

    const result = await fetchPendingMembershipSpaceIds(MEMBER);
    expect(result).toEqual(['aaaa']);
  });

  it('returns [] when there are no candidate actions (skips the second query)', async () => {
    graphqlMock.mockImplementation(() => Effect.succeed({ proposalActionsConnection: { nodes: [] } }));

    const result = await fetchPendingMembershipSpaceIds(MEMBER);
    expect(result).toEqual([]);
    expect(fetchActiveMemberRequestMock).not.toHaveBeenCalled();
    // Only the actions query runs; no proposals lookup.
    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes candidate spaces before confirming', async () => {
    mockCandidates(['dupe', 'dupe']);
    fetchActiveMemberRequestMock.mockResolvedValue({ proposalId: 'x', isVotingEnded: false });

    const result = await fetchPendingMembershipSpaceIds(MEMBER);
    expect(result).toEqual(['dupe']);
    expect(fetchActiveMemberRequestMock).toHaveBeenCalledTimes(1);
  });
});
