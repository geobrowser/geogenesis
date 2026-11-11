import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { decodeFunctionData } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GOVERNANCE_ACTIONS, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';

import { useMemberFastPath } from './use-member-fast-path';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const VIEWER = 'b7c1aa0e3f2d4c5b9a8e7d6c5b4a3f21';
const MEMBER = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  tx: vi.fn(),
  spaceAddress: '0xdao' as string | undefined,
}));

vi.mock('~/core/state/status-bar-store', () => ({ useStatusBar: () => ({ dispatch: mocks.dispatch }) }));
vi.mock('./use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: { account: { address: '0xv' } } }) }));
vi.mock('./use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: VIEWER, isRegistered: true }),
}));
vi.mock('./use-space', () => ({
  useSpace: () => ({ space: mocks.spaceAddress ? { address: mocks.spaceAddress } : null }),
}));
vi.mock('./use-smart-account-transaction', () => ({ useSmartAccountTransaction: () => mocks.tx }));
vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.either(effect)),
}));

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function sentAction() {
  const { data } = mocks.tx.mock.calls[0]![0] as { data: `0x${string}` };
  return decodeFunctionData({ abi: SpaceRegistryAbi, data }).args?.[2];
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  mocks.spaceAddress = '0xdao';
  mocks.tx.mockReturnValue(Effect.succeed('0xreceipt'));
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe('useMemberFastPath', () => {
  it('restricts directly and refreshes every cached restriction read', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMemberFastPath({ spaceId: SPACE, action: 'make_review_only' }), { wrapper });

    act(() => result.current.run(MEMBER));
    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(sentAction()).toBe(GOVERNANCE_ACTIONS.SPACE_FAST_PATH_RESTRICTED);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fast-path-restricted'] });
  });

  // A proposal only changes the role once it passes, so the cached answer is still right.
  it('creates a proposal for fast path without touching the cached reads', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useMemberFastPath({ spaceId: SPACE, action: 'give_fast_path' }), { wrapper });

    act(() => result.current.run(MEMBER));
    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(sentAction()).toBe(GOVERNANCE_ACTIONS.PROPOSAL_CREATED);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reports a failed write with a retry and surfaces the error state', async () => {
    mocks.tx.mockReturnValue(Effect.fail(new Error('reverted')));
    const { result } = renderHook(() => useMemberFastPath({ spaceId: SPACE, action: 'give_fast_path' }), { wrapper });

    act(() => result.current.run(MEMBER));
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ERROR', retry: expect.any(Function) })
    );
  });

  // A retry that bypassed the mutation left the button on "Try again" and able to send a duplicate.
  it('retries from the status bar through the mutation, so the button tracks it', async () => {
    mocks.tx.mockReturnValueOnce(Effect.fail(new Error('reverted')));
    const { result } = renderHook(() => useMemberFastPath({ spaceId: SPACE, action: 'give_fast_path' }), { wrapper });

    act(() => result.current.run(MEMBER));
    await waitFor(() => expect(result.current.status).toBe('error'));

    const { retry } = mocks.dispatch.mock.calls[0]![0] as { retry: () => void };
    act(() => retry());
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('refuses to write when the space has no deployed address', async () => {
    mocks.spaceAddress = undefined;
    const { result } = renderHook(() => useMemberFastPath({ spaceId: SPACE, action: 'make_review_only' }), { wrapper });

    act(() => result.current.run(MEMBER));
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(mocks.tx).not.toHaveBeenCalled();
  });
});
