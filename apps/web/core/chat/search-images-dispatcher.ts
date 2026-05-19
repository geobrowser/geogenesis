'use client';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';

import { enqueue } from './apply-queue';
import type { SearchImagesInput, SearchImagesOutput, SearchImagesResult } from './read-types';

const SEARCH_IMAGES_TOOL_PART = 'tool-searchImages';

// Mirrors AddToolResultFn shapes from the read/edit/research dispatchers — typed
// wide so the same useChat addToolResult ref can be shared across all of them.
export type AddSearchImagesResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

async function fetchSearchImages(input: SearchImagesInput, signal: AbortSignal): Promise<SearchImagesOutput> {
  try {
    const res = await fetch('/api/chat/search-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input.query }),
      signal,
    });
    if (res.status === 401) {
      return { error: 'not_signed_in' };
    }
    if (res.status === 429) {
      return { error: 'rate_limited' };
    }
    if (!res.ok) {
      console.error('[chat/search-images-dispatcher] non-ok', res.status);
      return { error: 'lookup_failed' };
    }
    const body = (await res.json()) as { images?: unknown };
    if (!Array.isArray(body.images)) {
      return { error: 'lookup_failed' };
    }
    const images: SearchImagesResult[] = body.images.flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const r = entry as Record<string, unknown>;
      if (typeof r.url !== 'string') return [];
      return [
        {
          url: r.url,
          title: typeof r.title === 'string' && r.title.length > 0 ? r.title : null,
          sourceUrl: typeof r.sourceUrl === 'string' && r.sourceUrl.length > 0 ? r.sourceUrl : null,
        },
      ];
    });
    return { images };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw err;
    }
    console.error('[chat/search-images-dispatcher] fetch threw', err);
    return { error: 'lookup_failed' };
  }
}

export function useSearchImagesDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddSearchImagesResultFn | null>
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
        if (part.type !== SEARCH_IMAGES_TOOL_PART) continue;
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = (part as { input?: unknown }).input as SearchImagesInput | undefined;
        const toolCallId = part.toolCallId;
        const query = typeof input?.query === 'string' ? input.query : '';

        enqueue(async () => {
          if (cancelledRef.current) return;
          if (!query) {
            addToolResultRef.current?.({
              tool: 'searchImages',
              toolCallId,
              output: { error: 'lookup_failed' } as SearchImagesOutput,
            });
            return;
          }
          const signal = (abortRef.current ??= new AbortController()).signal;
          const output = await fetchSearchImages({ query }, signal);
          if (cancelledRef.current) return;
          addToolResultRef.current?.({ tool: 'searchImages', toolCallId, output });
        });
      }
    }
  }, [messages, addToolResultRef]);
}
