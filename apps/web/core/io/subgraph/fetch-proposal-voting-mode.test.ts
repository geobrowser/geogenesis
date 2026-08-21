import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProposal } from './fetch-proposal';

const restFetchMock = vi.fn();

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
  fetchProfileBySpaceId: () => Effect.succeed(null),
  fetchProfilesBySpaceIds: () => Effect.succeed([]),
}));

/** A proposal payload with only the fields the mapping under test reads. */
function apiProposal(votingMode: 'FAST' | 'SLOW') {
  return {
    proposalId: 'proposal-1',
    proposalVersion: 2,
    spaceId: 'space-1',
    name: 'Add a claim',
    proposedBy: 'author-space-1',
    status: 'PROPOSED',
    votingMode,
    actions: [],
    userVote: null,
    canExecute: false,
    quorum: { required: 2, current: 0, progress: 0, reached: false },
    threshold: { required: '51', current: 0, progress: 0, reached: false },
    timing: { startTime: 1, endTime: 2, timeRemaining: null, isVotingEnded: false },
    votes: { yes: 0, no: 0, abstain: 0, total: 0, voters: [] },
  };
}

beforeEach(() => {
  restFetchMock.mockReset();
});

describe('fetchProposal voting mode', () => {
  // A reviewer is shown this to decide how much weight their vote carries, so it has to be
  // the path the author actually submitted under rather than a default.
  it.each(['FAST', 'SLOW'] as const)('carries the %s path through to the proposal', async votingMode => {
    restFetchMock.mockReturnValue(Effect.succeed(apiProposal(votingMode)));

    const proposal = await fetchProposal({ id: 'proposal-1' });

    expect(proposal?.votingMode).toBe(votingMode);
  });
});
