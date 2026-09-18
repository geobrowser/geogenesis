import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProposalVotes } from './fetch-proposal';

const restFetchMock = vi.fn();
const fetchProfileBySpaceId = vi.fn();
const fetchProfilesBySpaceIds = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql', bundler: '', chainId: '19411', rpc: '' }),
  },
}));

vi.mock('../rest', async () => {
  const actual = await vi.importActual<typeof import('../rest')>('../rest');
  return { ...actual, restFetch: (...args: unknown[]) => restFetchMock(...args) };
});

vi.mock('./fetch-profile', () => ({
  defaultProfile: (id: string) => ({ id, address: id, name: null, avatarUrl: null, profileLink: null }),
  fetchProfileBySpaceId: (...args: unknown[]) => fetchProfileBySpaceId(...args),
  fetchProfilesBySpaceIds: (...args: unknown[]) => fetchProfilesBySpaceIds(...args),
}));

/** A proposal payload with only the fields this reader looks at. */
function apiProposal(voters: { voterId: string; vote: 'YES' | 'NO' | 'ABSTAIN' }[], spaceId = 'space-1') {
  return {
    proposalId: 'proposal-1',
    proposalVersion: 2,
    spaceId,
    name: 'Add a claim',
    proposedBy: 'author-space-1',
    status: 'PROPOSED',
    votingMode: 'FAST',
    actions: [],
    userVote: null,
    canExecute: false,
    quorum: { required: 2, current: 0, progress: 0, reached: false },
    threshold: { required: '51', current: 0, progress: 0, reached: false },
    timing: { startTime: 1, endTime: 2, timeRemaining: null, isVotingEnded: false },
    votes: { yes: 0, no: 0, abstain: 0, total: voters.length, voters },
  };
}

beforeEach(() => {
  restFetchMock.mockReset();
  fetchProfileBySpaceId.mockReset();
  fetchProfilesBySpaceIds.mockReset();
  fetchProfileBySpaceId.mockReturnValue(Effect.succeed(null));
  fetchProfilesBySpaceIds.mockReturnValue(Effect.succeed([]));
});

describe('fetchProposalVotes', () => {
  it('reports the owning space and the votes, in the internal vocabulary', async () => {
    restFetchMock.mockReturnValue(
      Effect.succeed(
        apiProposal([
          { voterId: 'voter-a', vote: 'YES' },
          { voterId: 'voter-b', vote: 'NO' },
          { voterId: 'voter-c', vote: 'ABSTAIN' },
        ])
      )
    );

    const result = await fetchProposalVotes({ id: 'proposal-1' });

    expect(result).toEqual({
      spaceId: 'space-1',
      votes: [
        { voterSpaceId: 'voter-a', vote: 'ACCEPT' },
        { voterSpaceId: 'voter-b', vote: 'REJECT' },
        { voterSpaceId: 'voter-c', vote: 'ABSTAIN' },
      ],
      complete: true,
    });
  });

  /**
   * The reason this reader exists. `fetchProposal` hydrates the creator's profile and every voter's,
   * and the comment attribution query discards all of it — while being invalidated repeatedly as a
   * vote settles through the indexer, so the waste repeats with it (GEO-2907).
   */
  it('hydrates no profiles', async () => {
    restFetchMock.mockReturnValue(
      Effect.succeed(
        apiProposal([
          { voterId: 'voter-a', vote: 'YES' },
          { voterId: 'voter-b', vote: 'NO' },
        ])
      )
    );

    await fetchProposalVotes({ id: 'proposal-1' });

    expect(fetchProfileBySpaceId).not.toHaveBeenCalled();
    expect(fetchProfilesBySpaceIds).not.toHaveBeenCalled();
  });

  it('reports the space the proposal belongs to, which need not be the one asking', async () => {
    restFetchMock.mockReturnValue(Effect.succeed(apiProposal([], 'owning-space')));

    const result = await fetchProposalVotes({ id: 'proposal-1' });

    expect(result?.spaceId).toBe('owning-space');
  });

  /**
   * The payload reports a tally beside the list, so a list shorter than the tally is detectable. It
   * matters because anything reading meaning into a *missing* vote — "Editor · Not voted" — would be
   * making a claim about a person the records cannot support.
   */
  it('reports an incomplete list when the payload says there are more votes than it returned', async () => {
    const payload = apiProposal([{ voterId: 'voter-a', vote: 'YES' }]);
    payload.votes.total = 4;
    restFetchMock.mockReturnValue(Effect.succeed(payload));

    const result = await fetchProposalVotes({ id: 'proposal-1' });

    expect(result?.complete).toBe(false);
    // What it did see is still reported — a vote in hand is a fact either way.
    expect(result?.votes).toEqual([{ voterSpaceId: 'voter-a', vote: 'ACCEPT' }]);
  });

  it('answers null for an id with no proposal behind it', async () => {
    restFetchMock.mockReturnValue(Effect.fail(new Error('boom')));

    const result = await fetchProposalVotes({ id: 'not-a-proposal' });

    expect(result).toBeNull();
  });
});
