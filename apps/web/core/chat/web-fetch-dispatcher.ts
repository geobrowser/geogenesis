'use client';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';

import { enqueue } from './apply-queue';
import type { WebFetchInput, WebFetchOutput } from './read-types';

const WEB_FETCH_TOOL_PART = 'tool-webFetch';

// Widened so the same useChat addToolResult ref can be shared with reads / writes.
export type AddWebFetchResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

async function fetchWebFetch(input: WebFetchInput, signal: AbortSignal): Promise<WebFetchOutput> {
  try {
    const res = await fetch('/api/chat/web-fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input.url }),
      signal,
    });
    if (res.status === 401) return { error: 'not_signed_in' };
    if (res.status === 429) return { error: 'rate_limited' };
    if (res.status === 400) return { error: 'invalid_url' };
    if (!res.ok) {
      console.error('[chat/web-fetch-dispatcher] non-ok', res.status);
      return { error: 'lookup_failed' };
    }
    const body = (await res.json()) as { summary?: unknown; sources?: unknown; error?: unknown };
    if (typeof body.error === 'string') {
      if (
        body.error === 'not_signed_in' ||
        body.error === 'rate_limited' ||
        body.error === 'invalid_url' ||
        body.error === 'not_accessible' ||
        body.error === 'lookup_failed'
      ) {
        return { error: body.error };
      }
      return { error: 'lookup_failed' };
    }
    if (typeof body.summary !== 'string' || body.summary.length === 0) {
      return { error: 'lookup_failed' };
    }
    const sources = Array.isArray(body.sources)
      ? body.sources.flatMap(entry => {
          if (!entry || typeof entry !== 'object') return [];
          const r = entry as Record<string, unknown>;
          if (typeof r.url !== 'string') return [];
          return [{ url: r.url, title: typeof r.title === 'string' ? r.title : null }];
        })
      : [];
    return { summary: body.summary, sources };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { error: 'lookup_failed' };
    }
    console.error('[chat/web-fetch-dispatcher] fetch threw', err);
    return { error: 'lookup_failed' };
  }
}

// Forwards `tool-webFetch` parts to the sub-agent endpoint. Same shape as the
// research dispatcher.
export function useWebFetchDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddWebFetchResultFn | null>
) {
  const dispatchedRef = React.useRef(new Set<string>());
  const cancelledRef = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.type !== WEB_FETCH_TOOL_PART) continue;
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = (part as { input?: unknown }).input as WebFetchInput | undefined;
        const toolCallId = part.toolCallId;
        const url = typeof input?.url === 'string' ? input.url : '';

        enqueue(async () => {
          if (cancelledRef.current) return;
          if (!url) {
            addToolResultRef.current?.({
              tool: 'webFetch',
              toolCallId,
              output: { error: 'invalid_url' } as WebFetchOutput,
            });
            return;
          }
          const signal = (abortRef.current ??= new AbortController()).signal;
          const output = await fetchWebFetch({ url }, signal);
          // StrictMode's second mount resets cancelledRef before in-flight aborts settle.
          if (signal.aborted) return;
          addToolResultRef.current?.({ tool: 'webFetch', toolCallId, output });
        });
      }
    }
  }, [messages, addToolResultRef]);
}
