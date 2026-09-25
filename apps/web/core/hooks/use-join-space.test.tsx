import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useJoinSpace } from './use-join-space';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  deferJoin: vi.fn(),
  requestToBeMember: vi.fn(),
  enqueuePendingAction: vi.fn(),
  smartAccount: null as unknown,
  personalSpace: { personalSpaceId: null as string | null, isRegistered: false },
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: mocks.smartAccount }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => mocks.personalSpace }));
vi.mock('~/core/hooks/use-request-to-be-member', () => ({
  useRequestToBeMember: () => ({
    requestToBeMember: mocks.requestToBeMember,
    requestToBeMemberAsync: vi.fn(),
    status: 'idle' as const,
  }),
}));
vi.mock('~/core/state/pending-actions', () => ({ useEnqueuePendingAction: () => mocks.enqueuePendingAction }));
vi.mock('~/core/state/pending-join-intents', () => ({ useDeferredJoin: () => mocks.deferJoin }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.smartAccount = null;
  mocks.personalSpace = { personalSpaceId: null, isRegistered: false };
});

describe('useJoinSpace', () => {
  // Signed out goes straight to Privy — no interstitial card — with the intent parked so it
  // fires once the account exists.
  it('parks the join intent and opens Privy when signed out', () => {
    const { result } = renderHook(() => useJoinSpace({ spaceId: 'space-1' }));

    act(() => result.current.join());

    expect(mocks.deferJoin).toHaveBeenCalledTimes(1);
    expect(mocks.promptSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.requestToBeMember).not.toHaveBeenCalled();
    expect(mocks.enqueuePendingAction).not.toHaveBeenCalled();
  });

  it('requests membership immediately once the personal space is registered', () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    mocks.personalSpace = { personalSpaceId: 'personal-1', isRegistered: true };
    const { result } = renderHook(() => useJoinSpace({ spaceId: 'space-1' }));

    act(() => result.current.join());

    expect(mocks.requestToBeMember).toHaveBeenCalledTimes(1);
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
  });

  it('queues the request, and shows it as requested, while the personal space is still registering', () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    const { result } = renderHook(() => useJoinSpace({ spaceId: 'space-1' }));

    act(() => result.current.join());

    expect(mocks.enqueuePendingAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'join:space-1', requires: 'personalSpace' })
    );
    expect(result.current.optimisticRequested).toBe(true);
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
    expect(mocks.requestToBeMember).not.toHaveBeenCalled();
  });
});
