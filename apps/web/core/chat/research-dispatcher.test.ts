import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scrubUnsettledToolParts } from '~/partials/chat/scrub-unsettled-tool-parts';

import { enqueue, waitForFlush } from './apply-queue';
import { useResearchDispatcher } from './research-dispatcher';

const QUERY = 'latest on the Ethereum roadmap';

function pendingMessages(toolCallId = 'research-1'): UIMessage[] {
  return [
    { id: 'user-1', role: 'user', parts: [{ type: 'text', text: QUERY }] },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'tool-research', toolCallId, state: 'input-available', input: { query: QUERY } }],
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function fetchHeldUntil(response: Promise<Response>) {
  return (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      void response.then(resolve);
    });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  cleanup();
  await waitForFlush();
  vi.unstubAllGlobals();
});

describe('useResearchDispatcher', () => {
  it('answers an active call once across renders, with the parsed result', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ summary: 'Found it', sources: [{ url: 'https://a.example', title: 'A' }] })
    );
    const addResult = { current: vi.fn() };
    const hook = renderHook(({ messages }) => useResearchDispatcher(messages, addResult), {
      initialProps: { messages: pendingMessages() },
    });
    await act(async () => {
      await waitForFlush();
    });
    hook.rerender({ messages: pendingMessages() });
    await act(async () => {
      await waitForFlush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/research',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(addResult.current).toHaveBeenCalledExactlyOnceWith({
      tool: 'research',
      toolCallId: 'research-1',
      output: { summary: 'Found it', sources: [{ url: 'https://a.example', title: 'A' }] },
    });
  });

  it.each(['stop', 'new chat', 'switch chat'])(
    'does not start a queued search after %s removes its tool call',
    async action => {
      const blocker = deferred<void>();
      void enqueue(() => blocker.promise);
      const addResult = { current: vi.fn() };
      const messages = pendingMessages();
      const hook = renderHook(({ messages }) => useResearchDispatcher(messages, addResult), {
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
      expect(fetchMock).not.toHaveBeenCalled();
      expect(addResult.current).not.toHaveBeenCalled();
    }
  );

  it('aborts an in-flight search when its tool call disappears, freeing the queue and dropping the late result', async () => {
    const response = deferred<Response>();
    fetchMock.mockImplementation(fetchHeldUntil(response.promise));
    const addResult = { current: vi.fn() };
    const hook = renderHook(({ messages }) => useResearchDispatcher(messages, addResult), {
      initialProps: { messages: pendingMessages() },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);

    hook.rerender({ messages: [] });
    expect(signal?.aborted).toBe(true);

    const next = vi.fn();
    void enqueue(next);
    await act(async () => {
      await waitForFlush();
    });
    expect(next).toHaveBeenCalled();

    await act(async () => {
      response.resolve(jsonResponse({ summary: 'late', sources: [] }));
      await waitForFlush();
    });
    expect(addResult.current).not.toHaveBeenCalled();
  });

  it('cancels on unmount and still dispatches once under StrictMode', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ summary: 'once', sources: [] }));
    const addResult = { current: vi.fn() };
    const hook = renderHook(() => useResearchDispatcher(pendingMessages(), addResult), {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });
    await act(async () => {
      await waitForFlush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(addResult.current).toHaveBeenCalledTimes(1);
    hook.unmount();

    fetchMock.mockClear();
    addResult.current.mockClear();
    const blocker = deferred<void>();
    void enqueue(() => blocker.promise);
    const unmounted = renderHook(() => useResearchDispatcher(pendingMessages('research-2'), addResult));
    unmounted.unmount();
    await act(async () => {
      blocker.resolve();
      await waitForFlush();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addResult.current).not.toHaveBeenCalled();
  });
});
