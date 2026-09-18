import type { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceAccess } from '~/core/access/space-access';
import type { Space } from '~/core/io/dto/spaces';

import { scrubUnsettledToolParts } from '~/partials/chat/scrub-unsettled-tool-parts';

import { enqueue, waitForFlush } from './apply-queue';

// `vi.mock` is hoisted, so these run before the dispatcher imports them.
const requestSpaceMembership = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
vi.mock('~/core/access/request-space-membership', () => ({ requestSpaceMembership }));

const getSpaceAccessById = vi.fn<(...args: unknown[]) => Effect.Effect<SpaceAccess, unknown>>();
vi.mock('~/core/access/space-access', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/access/space-access')>();
  return { ...actual, getSpaceAccessById: (...args: unknown[]) => getSpaceAccessById(...(args as [])) };
});

const fetchActiveMemberRequest = vi.fn<(...args: unknown[]) => Promise<{ isVotingEnded: boolean } | null>>(() =>
  Promise.resolve(null)
);
vi.mock('~/core/io/subgraph/fetch-proposed-members', () => ({ fetchActiveMemberRequest }));

vi.mock('~/core/io/queries', () => ({ getSpace: vi.fn(() => Effect.succeed(null)) }));

const hookDeps = { queryClient: null as QueryClient | null };
const hookTx = vi.fn(() => Effect.succeed('0xhash'));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => hookDeps.queryClient }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: {} }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: PERSONAL_SPACE_ID, isRegistered: true }),
}));
vi.mock('~/core/hooks/use-smart-account-transaction', () => ({ useSmartAccountTransaction: () => hookTx }));

const { resolveJoinSpace, useJoinSpaceDispatcher } = await import('./join-space-dispatcher');

const SPACE_ID = 'c9f267dc1b7a4f3d8e2a5b6c7d8e9f01';
const PERSONAL_SPACE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

// Only the fields resolveJoinSpace reads.
function daoSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: SPACE_ID,
    type: 'DAO',
    entity: { name: 'Crypto', image: null },
    ...overrides,
  } as unknown as Space;
}

function deps(space: Space | null, overrides: Record<string, unknown> = {}) {
  const queryClient = {
    fetchQuery: vi.fn(() => (space === null ? Promise.reject(new Error('miss')) : Promise.resolve(space))),
  } as unknown as QueryClient;
  return {
    hasAccount: true,
    personalSpaceId: PERSONAL_SPACE_ID,
    isRegistered: true,
    queryClient,
    tx: vi.fn(() => Effect.succeed('0xhash')),
    ...overrides,
  } as Parameters<typeof resolveJoinSpace>[0];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  requestSpaceMembership.mockReset().mockResolvedValue(undefined);
  getSpaceAccessById.mockReset().mockReturnValue(Effect.succeed({ isEditor: false, isMember: false, canEdit: false }));
  fetchActiveMemberRequest.mockReset().mockResolvedValue(null);
  hookDeps.queryClient = deps(daoSpace()).queryClient;
});

afterEach(async () => {
  cleanup();
  await waitForFlush();
});

describe('resolveJoinSpace', () => {
  it('requests membership when every check passes', async () => {
    const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
    expect(result).toEqual({ ok: true, status: 'requested', spaceId: SPACE_ID, spaceName: 'Crypto' });
    expect(requestSpaceMembership).toHaveBeenCalledTimes(1);
  });

  it('accepts a dashed uuid and normalizes it', async () => {
    const dashed = 'c9f267dc-1b7a-4f3d-8e2a-5b6c7d8e9f01';
    const result = await resolveJoinSpace(deps(daoSpace()), dashed);
    expect(result).toMatchObject({ ok: true, spaceId: SPACE_ID });
  });

  // Each of these must stop before the transaction — a signature the user did
  // not ask for is the failure mode this tool has to be incapable of.
  describe('does not sign', () => {
    it('on a malformed space id', async () => {
      const result = await resolveJoinSpace(deps(daoSpace()), 'not-a-space');
      expect(result).toEqual({ ok: false, error: 'invalid_input', spaceId: 'not-a-space' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when there is no account', async () => {
      const result = await resolveJoinSpace(deps(daoSpace(), { hasAccount: false }), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'not_signed_in' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the personal space is still unregistered', async () => {
      const result = await resolveJoinSpace(deps(daoSpace(), { isRegistered: false }), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'no_personal_space' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the space does not resolve', async () => {
      const result = await resolveJoinSpace(deps(null), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'space_not_found' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('on a personal space, which has no membership flow', async () => {
      const result = await resolveJoinSpace(deps(daoSpace({ type: 'PERSONAL' })), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'not_joinable', spaceName: 'Crypto' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the user is already a member', async () => {
      getSpaceAccessById.mockReturnValue(Effect.succeed({ isEditor: false, isMember: true, canEdit: true }));
      const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'already_member' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when a request is already up for a vote', async () => {
      fetchActiveMemberRequest.mockResolvedValue({ isVotingEnded: false });
      const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'already_requested' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the access check fails', async () => {
      getSpaceAccessById.mockReturnValue(Effect.fail(new Error('access unavailable')));
      expect(await resolveJoinSpace(deps(daoSpace()), SPACE_ID)).toMatchObject({ ok: false, error: 'request_failed' });
      expect(fetchActiveMemberRequest).not.toHaveBeenCalled();
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the pending request lookup fails', async () => {
      fetchActiveMemberRequest.mockRejectedValue(new Error('proposals unavailable'));
      expect(await resolveJoinSpace(deps(daoSpace()), SPACE_ID)).toMatchObject({ ok: false, error: 'request_failed' });
      expect(fetchActiveMemberRequest).toHaveBeenCalledWith(
        SPACE_ID,
        PERSONAL_SPACE_ID,
        expect.objectContaining({ throwOnError: true })
      );
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when cancelled while membership access is being checked', async () => {
      const access = deferred<SpaceAccess>();
      getSpaceAccessById.mockReturnValue(Effect.promise(() => access.promise));
      const controller = new AbortController();
      const pending = resolveJoinSpace(deps(daoSpace()), SPACE_ID, controller.signal);
      await waitFor(() => expect(getSpaceAccessById).toHaveBeenCalled());
      controller.abort();
      access.resolve({ isEditor: false, isMember: false, canEdit: false });
      await pending;
      expect(fetchActiveMemberRequest).not.toHaveBeenCalled();
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when cancelled while the pending request lookup is running', async () => {
      const lookup = deferred<null>();
      fetchActiveMemberRequest.mockReturnValue(lookup.promise);
      const controller = new AbortController();
      const pending = resolveJoinSpace(deps(daoSpace()), SPACE_ID, controller.signal);
      await waitFor(() => expect(fetchActiveMemberRequest).toHaveBeenCalled());
      controller.abort();
      lookup.resolve(null);
      await pending;
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });
  });

  it('re-requests once a previous vote has ended, so a rejection is not permanent', async () => {
    fetchActiveMemberRequest.mockResolvedValue({ isVotingEnded: true });
    const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
    expect(result).toMatchObject({ ok: true, status: 'requested' });
    expect(requestSpaceMembership).toHaveBeenCalledTimes(1);
  });

  it('reports a failed transaction rather than throwing into the dispatcher', async () => {
    requestSpaceMembership.mockRejectedValue(new Error('tx reverted'));
    const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
    expect(result).toMatchObject({ ok: false, error: 'request_failed' });
  });
});

const pendingMessages = (toolCallId = 'join-1'): UIMessage[] => [
  {
    id: 'assistant-1',
    role: 'assistant',
    parts: [{ type: 'tool-joinSpace', toolCallId, state: 'input-available', input: { spaceId: SPACE_ID } }],
  },
];

describe('useJoinSpaceDispatcher cancellation', () => {
  it('dispatches an active request once across renders', async () => {
    const addResult = { current: vi.fn() };
    const hook = renderHook(({ messages }) => useJoinSpaceDispatcher(messages, addResult), {
      initialProps: { messages: pendingMessages() },
    });
    await act(async () => {
      await waitForFlush();
    });
    hook.rerender({ messages: pendingMessages() });
    await act(async () => {
      await waitForFlush();
    });
    expect(requestSpaceMembership).toHaveBeenCalledTimes(1);
    expect(requestSpaceMembership).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(addResult.current).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        toolCallId: 'join-1',
        output: expect.objectContaining({ ok: true, status: 'requested' }),
      })
    );
  });

  it.each(['stop', 'new chat', 'switch chat'])(
    'does not sign a queued request after %s removes its tool call',
    async action => {
      const blocker = deferred<void>();
      void enqueue(() => blocker.promise);
      const addResult = { current: vi.fn() };
      const messages = pendingMessages();
      const hook = renderHook(({ messages }) => useJoinSpaceDispatcher(messages, addResult), {
        initialProps: { messages },
      });
      hook.rerender({
        messages:
          action === 'stop'
            ? scrubUnsettledToolParts(messages)
            : action === 'new chat'
              ? []
              : [
                  {
                    id: 'other-conversation',
                    role: 'user',
                    parts: [{ type: 'text', text: 'Another conversation' }],
                  },
                ],
      });
      await act(async () => {
        blocker.resolve();
        await waitForFlush();
      });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
      expect(addResult.current).not.toHaveBeenCalled();
    }
  );

  it('cancels immediately before a scrubbed transcript has rendered', async () => {
    const blocker = deferred<void>();
    void enqueue(() => blocker.promise);
    const addResult = { current: vi.fn() };
    const hook = renderHook(() => useJoinSpaceDispatcher(pendingMessages(), addResult));
    act(() => hook.result.current());
    await act(async () => {
      blocker.resolve();
      await waitForFlush();
    });
    expect(requestSpaceMembership).not.toHaveBeenCalled();
    expect(addResult.current).not.toHaveBeenCalled();
  });

  it('cancels an in-flight lookup when the conversation changes', async () => {
    const lookup = deferred<null>();
    fetchActiveMemberRequest.mockReturnValue(lookup.promise);
    const addResult = { current: vi.fn() };
    const hook = renderHook(({ messages }) => useJoinSpaceDispatcher(messages, addResult), {
      initialProps: { messages: pendingMessages() },
    });
    await waitFor(() => expect(fetchActiveMemberRequest).toHaveBeenCalled());
    hook.rerender({ messages: [] });
    await act(async () => {
      lookup.resolve(null);
      await waitForFlush();
    });
    expect(requestSpaceMembership).not.toHaveBeenCalled();
    expect(addResult.current).not.toHaveBeenCalled();
  });

  it('does not deliver a late transaction result into the next conversation', async () => {
    const tx = deferred<void>();
    requestSpaceMembership.mockReturnValue(tx.promise);
    const addResult = { current: vi.fn() };
    const hook = renderHook(({ messages }) => useJoinSpaceDispatcher(messages, addResult), {
      initialProps: { messages: pendingMessages() },
    });
    await waitFor(() => expect(requestSpaceMembership).toHaveBeenCalled());
    hook.rerender({ messages: [] });
    await act(async () => {
      tx.resolve();
      await waitForFlush();
    });
    expect(addResult.current).not.toHaveBeenCalled();
  });

  it('cancels on unmount and still dispatches once under StrictMode', async () => {
    const addResult = { current: vi.fn() };
    const hook = renderHook(() => useJoinSpaceDispatcher(pendingMessages(), addResult), {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });
    await act(async () => {
      await waitForFlush();
    });
    expect(requestSpaceMembership).toHaveBeenCalledTimes(1);
    expect(addResult.current).toHaveBeenCalledTimes(1);
    hook.unmount();

    requestSpaceMembership.mockClear();
    addResult.current.mockClear();
    const blocker = deferred<void>();
    void enqueue(() => blocker.promise);
    const unmounted = renderHook(() => useJoinSpaceDispatcher(pendingMessages('join-2'), addResult));
    unmounted.unmount();
    await act(async () => {
      blocker.resolve();
      await waitForFlush();
    });
    expect(requestSpaceMembership).not.toHaveBeenCalled();
    expect(addResult.current).not.toHaveBeenCalled();
  });
});
