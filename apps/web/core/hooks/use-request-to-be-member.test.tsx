import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lockedOutJoinAtom } from '~/core/state/locked-out-join';

import { useRequestToBeMember } from './use-request-to-be-member';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  requestSpaceMembership: vi.fn(),
  alreadyMember: false,
  readFastPathRestricted: vi.fn(),
  failureOf: undefined as ((data: unknown) => string | null) | undefined,
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
vi.mock('~/core/access/request-space-membership', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/access/request-space-membership')>()),
  requestSpaceMembership: mocks.requestSpaceMembership,
}));
vi.mock('~/core/utils/contracts/read-space-membership', () => ({
  readFastPathRestricted: mocks.readFastPathRestricted,
}));
vi.mock('~/core/hooks/use-observed-mutation', () => ({
  useObservedMutation: (mutation: unknown, _action: unknown, _context: unknown, failureOf: never) => {
    mocks.failureOf = failureOf;
    return mutation;
  },
}));

let store = createStore();
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.alreadyMember = false;
  mocks.readFastPathRestricted.mockResolvedValue(false);
  store = createStore();
});
afterEach(cleanup);

describe('useRequestToBeMember', () => {
  it('requests membership for a viewer who is not yet a member', async () => {
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => result.current.requestToBeMemberAsync());

    expect(mocks.requestSpaceMembership).toHaveBeenCalledOnce();
  });

  it('sends the space name with the join conversion when the control knows it', async () => {
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE, space: { name: 'Philosophy' } }), {
      wrapper,
    });

    await act(() => result.current.requestToBeMemberAsync());

    const dataLayer = (window as Window & { dataLayer?: Record<string, unknown>[] }).dataLayer ?? [];
    expect(dataLayer.at(-1)).toMatchObject({ event: 'geo_join_space', space_id: SPACE, space_name: 'Philosophy' });
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
  // A sign-out can clear the queued request while its membership check is out.
  it('does not send a queued request that stopped being the queued one during its check', async () => {
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => result.current.requestToBeMemberAsync({ fromQueue: true, isCurrent: () => false }));

    expect(mocks.requestSpaceMembership).not.toHaveBeenCalled();
  });

  it('treats an existing membership as done for a queued request', async () => {
    mocks.alreadyMember = true;
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => expect(result.current.requestToBeMemberAsync({ fromQueue: true })).resolves.toBeUndefined());

    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.requestSpaceMembership).not.toHaveBeenCalled();
  });

  // Joining while signed out is the usual way someone who left comes back, and that path skips the
  // press-time check in useJoinSpace: the contract would refuse the request with a raw RPC error.
  it('opens the ask-an-editor link instead of sending a queued request from a restricted viewer', async () => {
    mocks.readFastPathRestricted.mockResolvedValue(true);
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => expect(result.current.requestToBeMemberAsync({ fromQueue: true })).resolves.toBe('locked_out'));

    expect(store.get(lockedOutJoinAtom)).toEqual({
      link: expect.stringContaining(`/space/${SPACE}?addBack=`),
      spaceName: undefined,
    });
    // Recorded as a rejected join rather than a successful one.
    expect(mocks.failureOf?.('locked_out')).toBe('rejected');
    expect(mocks.failureOf?.(undefined)).toBeNull();
    expect(mocks.requestSpaceMembership).not.toHaveBeenCalled();
  });

  it('sends a queued request when the viewer is not restricted, or the check fails', async () => {
    mocks.readFastPathRestricted.mockRejectedValueOnce(new Error('rpc down'));
    const { result } = renderHook(() => useRequestToBeMember({ spaceId: SPACE }), { wrapper });

    await act(() => result.current.requestToBeMemberAsync({ fromQueue: true }));

    expect(mocks.requestSpaceMembership).toHaveBeenCalledOnce();
    expect(store.get(lockedOutJoinAtom)).toBeNull();
  });
});
