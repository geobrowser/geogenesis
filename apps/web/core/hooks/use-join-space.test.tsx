import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingActionsAtom } from '~/core/state/pending-actions';

import { useJoinSpace } from './use-join-space';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  requestToBeMember: vi.fn(),
  requestToBeMemberAsync: vi.fn(),
  smartAccount: null as unknown,
  personalSpace: { personalSpaceId: null as string | null, isRegistered: false, isLoading: false },
  accountSetupPending: false,
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: mocks.smartAccount }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => mocks.personalSpace }));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: mocks.accountSetupPending }),
}));
vi.mock('~/core/hooks/use-request-to-be-member', () => ({
  useRequestToBeMember: () => ({
    requestToBeMember: mocks.requestToBeMember,
    requestToBeMemberAsync: mocks.requestToBeMemberAsync,
    status: 'idle' as const,
  }),
}));

/** The real pending-actions queue, so a test can see what a press left for the runner. */
let store = createStore();
const queued = () => store.get(pendingActionsAtom);
const wrapper = ({ children }: { children: ReactNode }) => <JotaiProvider store={store}>{children}</JotaiProvider>;
const renderJoin = () => renderHook(() => useJoinSpace({ spaceId: 'space-1' }), { wrapper });

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestToBeMemberAsync.mockResolvedValue(undefined);
  store = createStore();
  mocks.smartAccount = null;
  mocks.personalSpace = { personalSpaceId: null, isRegistered: false, isLoading: false };
  mocks.accountSetupPending = false;
});

describe('useJoinSpace', () => {
  // Signed in with no space and none on its way: nothing would ever send it, so nothing is queued
  // and the button does not claim a request was made.
  it('queues nothing for a signed-in account with no space being made', () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    const { result } = renderJoin();

    act(() => result.current.join());

    expect(queued()).toHaveLength(0);
    expect(result.current.optimisticRequested).toBe(false);
  });

  // A returning viewer whose space is still loading: it resolves, and the queued request goes.
  it('queues for a returning account whose space is still loading', () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    mocks.personalSpace = { personalSpaceId: null, isRegistered: false, isLoading: true };
    const { result } = renderJoin();

    act(() => result.current.join());

    expect(queued()).toHaveLength(1);
  });

  // Signed out goes straight to Privy, with the request queued at the press: the button can unmount
  // while the viewer signs up, and the runner — not the button — submits it once the space exists.
  it('queues the request at the press and opens Privy when signed out', async () => {
    const { result } = renderJoin();

    act(() => result.current.join());

    expect(mocks.promptSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.requestToBeMember).not.toHaveBeenCalled();
    expect(queued()).toEqual([expect.objectContaining({ id: 'join:space-1', requires: 'personalSpace' })]);
    expect(result.current.optimisticRequested).toBe(true);

    await queued()[0]!.run();
    expect(mocks.requestToBeMemberAsync).toHaveBeenCalledTimes(1);
  });

  it('withdraws the request when the sign-in is dismissed', () => {
    const { result } = renderJoin();

    act(() => result.current.join());
    act(() => mocks.promptSignIn.mock.calls[0]![1].onCancel());

    expect(queued()).toHaveLength(0);
    expect(result.current.optimisticRequested).toBe(false);
  });

  it('still shows the request as made after the button remounts', () => {
    const first = renderJoin();
    act(() => first.result.current.join());
    first.unmount();

    expect(renderJoin().result.current.optimisticRequested).toBe(true);
  });

  it('requests membership immediately once the personal space is registered', () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    mocks.personalSpace = { personalSpaceId: 'personal-1', isRegistered: true, isLoading: false };
    const { result } = renderJoin();

    act(() => result.current.join());

    expect(mocks.requestToBeMember).toHaveBeenCalledTimes(1);
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
    expect(queued()).toHaveLength(0);
  });

  it('queues the request, and shows it as requested, while the personal space is still registering', () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    mocks.accountSetupPending = true;
    const { result } = renderJoin();

    act(() => result.current.join());

    expect(queued()).toEqual([expect.objectContaining({ id: 'join:space-1', requires: 'personalSpace' })]);
    expect(result.current.optimisticRequested).toBe(true);
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
    expect(mocks.requestToBeMember).not.toHaveBeenCalled();
  });
});
