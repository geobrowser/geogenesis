import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PENDING_OUTBOUND_REQUEST_REASON } from '~/core/debates/request-gate';

const mocks = vi.hoisted(() => ({
  activityOutboundRequest: null as { id: string } | null,
  outboundRequestCreationPending: false,
  resolveOutboundChallenge: vi.fn(() => ({
    outboundChallenge: null,
    outboundChallengeDirectionUnknown: false,
  })),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateActivity: () => ({ data: { available_to_debate: true, outbound_request: mocks.activityOutboundRequest } }),
}));

vi.mock('~/core/debates/matchmaking/hooks', () => ({
  useMatchmakingMatches: () => ({ data: { matches: [] } }),
  useDebateRequests: () => ({ data: { outbound: null } }),
  useCreateDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('~/core/debates/matchmaking/use-outbound-debate-challenge', () => ({
  useOutboundDebateChallenge: () => mocks.resolveOutboundChallenge(),
}));

vi.mock('~/core/debates/matchmaking/debate-challenge-state-provider', () => ({
  useSharedOutboundRequestState: () => ({
    outboundChallenge: null,
    outboundChallengeDirectionUnknown: false,
    outboundRequestCreationPending: mocks.outboundRequestCreationPending,
  }),
}));

vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => 'viewer-user',
}));

const { useClaimMatchup } = await import('./use-claim-matchup');

beforeEach(() => {
  mocks.activityOutboundRequest = null;
  mocks.outboundRequestCreationPending = false;
  mocks.resolveOutboundChallenge.mockClear();
});

describe('useClaimMatchup', () => {
  it('trusts an authoritative empty request list over stale activity', () => {
    mocks.activityOutboundRequest = { id: 'stale-activity-request' };

    const { result } = renderHook(() => useClaimMatchup({ claimId: 'claim-1', spaceId: 'space-1' }));

    expect(result.current.blockedReason).toBeUndefined();
  });

  it('blocks while another control is creating an outbound request', () => {
    mocks.outboundRequestCreationPending = true;

    const { result } = renderHook(() => useClaimMatchup({ claimId: 'claim-1', spaceId: 'space-1' }));

    expect(result.current.blockedReason).toBe(PENDING_OUTBOUND_REQUEST_REASON);
  });

  it('does not resolve account-level challenge identity and expiry once per claim card', () => {
    renderHook(() => useClaimMatchup({ claimId: 'claim-1', spaceId: 'space-1' }));
    renderHook(() => useClaimMatchup({ claimId: 'claim-2', spaceId: 'space-1' }));

    expect(mocks.resolveOutboundChallenge).not.toHaveBeenCalled();
  });
});
