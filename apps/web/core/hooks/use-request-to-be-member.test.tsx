import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRequestToBeMember } from './use-request-to-be-member';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  requestSpaceMembership: vi.fn(),
  alreadyMember: false,
}));

vi.mock('~/core/state/status-bar-store', () => ({ useStatusBar: () => ({ state: null, dispatch: mocks.dispatch }) }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xviewer' } } }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  personalSpaceIdQueryKey: (address: string | null | undefined) => ['personal-space-id', address],
  usePersonalSpaceId: () => ({ personalSpaceId: 'b7c1aa0e3f2d4c5b9a8e7d6c5b4a3f21', isRegistered: true }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({ usePendingPersonalSpace: () => ({ isPending: false }) }));
vi.mock('~/core/hooks/use-smart-account-transaction', () => ({ useSmartAccountTransaction: () => vi.fn() }));
vi.mock('~/core/io/queries', () => ({
  getIsMemberOfSpace: () => Effect.succeed(mocks.alreadyMember),
  getIsEditorOfSpace: () => Effect.succeed(false),
}));
vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.either(effect)),
}));
vi.mock('~/core/access/request-space-membership', () => ({ requestSpaceMembership: mocks.requestSpaceMembership }));
vi.mock('~/core/hooks/use-observed-mutation', () => ({ useObservedMutation: (mutation: unknown) => mutation }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.alreadyMember = false;
});
afterEach(cleanup);

describe('useRequestToBeMember', () => {
  it('requests membership for a viewer who is not yet a member', async () => {
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => result.current.requestToBeMemberAsync());

    expect(mocks.requestSpaceMembership).toHaveBeenCalledOnce();
  });

  // Pressed live by someone already in: say so, as it always has.
  it('reports an existing membership on a live press', async () => {
    mocks.alreadyMember = true;
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => expect(result.current.requestToBeMemberAsync()).rejects.toThrow(/already a member/));

    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ERROR' }));
    expect(mocks.requestSpaceMembership).not.toHaveBeenCalled();
  });

  // A returning member pressed Join while signed out, and the queue replays it once they are in.
  // What it was for is already true: done, quietly — throwing kept it queued and the button
  // "requested" for good.
  it('treats an existing membership as done for a queued request', async () => {
    mocks.alreadyMember = true;
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => expect(result.current.requestToBeMemberAsync({ fromQueue: true })).resolves.toBeUndefined());

    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.requestSpaceMembership).not.toHaveBeenCalled();
  });
});
