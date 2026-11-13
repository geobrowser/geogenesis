import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scrubUnsettledToolParts } from '~/partials/chat/scrub-unsettled-tool-parts';

import { enqueue, waitForFlush } from './apply-queue';

const findOne = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('~/core/sync/orm', () => ({ E: { findOne: (...args: unknown[]) => findOne(...args) } }));
vi.mock('~/core/sync/use-sync-engine', () => ({ store: {} }));
vi.mock('~/core/query-client', () => ({ queryClient: {} }));
vi.mock('~/core/io/queries', () => ({
  getResults: vi.fn(),
  getEntityNames: vi.fn(),
  getEntity: vi.fn(),
  getSpace: vi.fn(),
  getSpaces: vi.fn(),
}));

const { useReadDispatcher } = await import('./read-dispatcher');

const ENTITY_ID = 'a'.repeat(32);

function pendingMessages(toolCallId = 'read-1'): UIMessage[] {
  return [
    { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'What is this entity?' }] },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'tool-getEntity', toolCallId, state: 'input-available', input: { entityId: ENTITY_ID } }],
    },
  ] as UIMessage[];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  findOne.mockReset().mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  await waitForFlush();
  vi.restoreAllMocks();
});

describe('useReadDispatcher cancellation', () => {
  it('answers an active read once across renders', async () => {
    const addResult = { current: vi.fn() };
    const hook = renderHook(({ messages }) => useReadDispatcher(messages, addResult, []), {
      initialProps: { messages: pendingMessages() },
    });
    await act(async () => {
      await waitForFlush();
    });
    hook.rerender({ messages: pendingMessages() });
    await act(async () => {
      await waitForFlush();
    });
    expect(addResult.current).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tool: 'getEntity', toolCallId: 'read-1' })
    );
  });

  it.each(['stop', 'new chat', 'switch chat'])(
    'does not start a queued read after %s removes its tool call',
    async action => {
      const blocker = deferred<void>();
      void enqueue(() => blocker.promise);
      const addResult = { current: vi.fn() };
      const messages = pendingMessages();
      const hook = renderHook(({ messages }) => useReadDispatcher(messages, addResult, []), {
        initialProps: { messages },
      });
      hook.rerender({
        messages:
          action === 'stop'
            ? scrubUnsettledToolParts(messages)
            : action === 'new chat'
              ? []
              : [{ id: 'other-conversation', role: 'user', parts: [{ type: 'text', text: 'Another conversation' }] }],
      });
      await act(async () => {
        blocker.resolve();
        await waitForFlush();
      });
      expect(findOne).not.toHaveBeenCalled();
      expect(addResult.current).not.toHaveBeenCalled();
    }
  );

  it('drops the result of an in-flight read whose tool call disappeared', async () => {
    const lookup = deferred<null>();
    findOne.mockReturnValue(lookup.promise);
    const addResult = { current: vi.fn() };
    const hook = renderHook(({ messages }) => useReadDispatcher(messages, addResult, []), {
      initialProps: { messages: pendingMessages() },
    });
    await waitFor(() => expect(findOne).toHaveBeenCalled());
    hook.rerender({ messages: [] });
    await act(async () => {
      lookup.resolve(null);
      await waitForFlush();
    });
    expect(addResult.current).not.toHaveBeenCalled();
  });

  it('cancels on unmount and still dispatches once under StrictMode', async () => {
    const addResult = { current: vi.fn() };
    const hook = renderHook(() => useReadDispatcher(pendingMessages(), addResult, []), {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });
    await act(async () => {
      await waitForFlush();
    });
    expect(addResult.current).toHaveBeenCalledTimes(1);
    hook.unmount();

    findOne.mockClear();
    addResult.current.mockClear();
    const blocker = deferred<void>();
    void enqueue(() => blocker.promise);
    const unmounted = renderHook(() => useReadDispatcher(pendingMessages('read-2'), addResult, []));
    unmounted.unmount();
    await act(async () => {
      blocker.resolve();
      await waitForFlush();
    });
    expect(findOne).not.toHaveBeenCalled();
    expect(addResult.current).not.toHaveBeenCalled();
  });
});
