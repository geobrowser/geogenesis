'use client';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';

import { enqueue } from './apply-queue';
import type { ResearchInput, ResearchOutput } from './read-types';

const RESEARCH_TOOL_PART = 'tool-research';

// Widened so the same useChat addToolResult ref can be shared with reads + writes.
export type AddResearchResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

async function fetchResearch(input: ResearchInput, signal: AbortSignal): Promise<ResearchOutput> {
  try {
    const res = await fetch('/api/chat/research', {
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
      console.error('[chat/research-dispatcher] non-ok', res.status);
      return { error: 'lookup_failed' };
    }
    const body = (await res.json()) as { summary?: unknown; sources?: unknown };
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
      // Expected on unmount/navigation — return an error instead of throwing
      // so apply-queue doesn't log it. The cancelledRef check downstream
      // suppresses the phantom tool result.
      return { error: 'lookup_failed' };
    }
    console.error('[chat/research-dispatcher] fetch threw', err);
    return { error: 'lookup_failed' };
  }
}

// Forwards `tool-research` parts to the sub-agent endpoint. Same shape as the
// read / edit dispatchers; shares the same addToolResult ref.
export function useResearchDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddResearchResultFn | null>
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
        if (part.type !== RESEARCH_TOOL_PART) continue;
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = (part as { input?: unknown }).input as ResearchInput | undefined;
        const toolCallId = part.toolCallId;
        const query = typeof input?.query === 'string' ? input.query : '';

        enqueue(async () => {
          if (cancelledRef.current) return;
          if (!query) {
            addToolResultRef.current?.({
              tool: 'research',
              toolCallId,
              output: { error: 'lookup_failed' } as ResearchOutput,
            });
            return;
          }
          const signal = (abortRef.current ??= new AbortController()).signal;
          const output = await fetchResearch({ query }, signal);
          if (cancelledRef.current) return;
          addToolResultRef.current?.({ tool: 'research', toolCallId, output });
        });
      }
    }
  }, [messages, addToolResultRef]);
}
