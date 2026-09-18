'use client';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';

import { enqueue } from './apply-queue';
import type { GeoQueryInput, GeoQueryOutput } from './geo-query-types';

const GEO_QUERY_TOOL_PART = 'tool-geoQuery';

// Widened so the same useChat addToolResult ref can be shared with reads + writes.
export type AddGeoQueryResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

async function fetchGeoQuery(input: GeoQueryInput, signal: AbortSignal): Promise<GeoQueryOutput> {
  try {
    const res = await fetch('/api/chat/geo-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: input.question }),
      signal,
    });
    if (res.status === 401) return { error: 'not_signed_in' };
    if (res.status === 429) return { error: 'rate_limited' };
    if (res.status === 504) return { error: 'timed_out' };
    if (res.status === 400) return { error: 'question_rejected' };
    if (!res.ok) {
      console.error('[chat/geo-query-dispatcher] non-ok', res.status);
      return { error: 'lookup_failed' };
    }

    const body = (await res.json()) as { answer?: unknown; rows?: unknown; totalCount?: unknown; queries?: unknown };
    if (typeof body.answer !== 'string' || body.answer.length === 0) {
      return { error: 'lookup_failed' };
    }

    const rows = Array.isArray(body.rows)
      ? body.rows.flatMap(entry => {
          if (!entry || typeof entry !== 'object') return [];
          const r = entry as Record<string, unknown>;
          if (typeof r.id !== 'string') return [];
          return [
            {
              id: r.id,
              name: typeof r.name === 'string' ? r.name : null,
              spaceId: typeof r.spaceId === 'string' ? r.spaceId : null,
            },
          ];
        })
      : [];

    return {
      answer: body.answer,
      rows,
      ...(typeof body.totalCount === 'number' ? { totalCount: body.totalCount } : {}),
      queries: Array.isArray(body.queries) ? body.queries.filter((q): q is string => typeof q === 'string') : [],
    };
  } catch (err) {
    if (signal.aborted) return { error: 'lookup_failed' };
    console.error('[chat/geo-query-dispatcher] fetch failed', err);
    return { error: 'lookup_failed' };
  }
}

/**
 * Dispatches `geoQuery` tool calls to the sub-agent route.
 *
 * Mirrors the research dispatcher: the tool is declared schema-only server-side
 * so the model can call it, and the actual work happens here, out of the main
 * turn's context. Every dispatched call is answered exactly once — an
 * unanswered call leaves the panel spinning forever with nothing to resolve it.
 */
export function useGeoQueryDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddGeoQueryResultFn | null>
) {
  const dispatchedRef = React.useRef(new Set<string>());
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.type !== GEO_QUERY_TOOL_PART) continue;
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = ((part as { input?: unknown }).input ?? {}) as GeoQueryInput;
        const toolCallId = part.toolCallId;

        enqueue(async () => {
          const signal = abortRef.current?.signal;
          if (!signal || signal.aborted) return;
          let output: GeoQueryOutput;
          try {
            output = await fetchGeoQuery(input, signal);
          } catch (err) {
            console.error('[chat/geo-query-dispatcher] tool execution threw', err);
            output = { error: 'lookup_failed' };
          }
          addToolResultRef.current?.({ tool: 'geoQuery', toolCallId, output });
        });
      }
    }
  }, [messages, addToolResultRef]);
}
