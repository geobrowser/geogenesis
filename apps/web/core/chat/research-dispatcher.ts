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
      // Expected when the call is cancelled — return an error instead of
      // throwing so apply-queue doesn't log it. The signal check downstream
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
  const controllers = React.useRef(new Map<string, AbortController>());

  React.useEffect(() => {
    const active = controllers.current;
    const dispatched = dispatchedRef.current;
    return () => {
      for (const [id, controller] of active) {
        controller.abort();
        dispatched.delete(id);
      }
      active.clear();
    };
  }, []);

  React.useEffect(() => {
    const pending = new Set(
      messages.flatMap(message =>
        message.role === 'assistant'
          ? message.parts.flatMap(part =>
              part.type === RESEARCH_TOOL_PART && isToolUIPart(part) && part.state === 'input-available'
                ? [part.toolCallId]
                : []
            )
          : []
      )
    );
    for (const [id, controller] of controllers.current) {
      if (!pending.has(id)) {
        controller.abort();
        controllers.current.delete(id);
      }
    }

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
        const controller = new AbortController();
        controllers.current.set(toolCallId, controller);
        const signal = controller.signal;

        enqueue(async () => {
          try {
            if (signal.aborted) return;
            const output = query
              ? await fetchResearch({ query }, signal)
              : ({ error: 'lookup_failed' } as ResearchOutput);
            if (!signal.aborted) addToolResultRef.current?.({ tool: 'research', toolCallId, output });
          } finally {
            if (controllers.current.get(toolCallId) === controller) controllers.current.delete(toolCallId);
          }
        });
      }
    }
  }, [messages, addToolResultRef]);
}
