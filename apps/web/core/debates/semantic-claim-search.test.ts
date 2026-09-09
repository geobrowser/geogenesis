import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveSemanticSearch, sameTaggedFilters, useSemanticTaggedFilters } from './semantic-claim-search';
import { NO_TAGGED_CLAIM_FILTERS, type TaggedClaimFilters } from './tagged-claims';

const TAG = 'ec3086a54ddf43d8aaefd6cc6e1b0556';
const SPACE = '019fedae72b67ab2927adf044d57c566';
const TOPIC = '5d050707bc5840119b1e81ad3adb6244';
const HITS = [
  { id: 'a2', score: 0.93 },
  { id: 'a1', score: 0.85 },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

/** The route, answering every request with `body` (or failing with `status`). */
function stubRoute(answer: { body?: unknown; status?: number; delayMs?: number }) {
  const fetchMock = vi.fn(async () => {
    if (answer.delayMs) await new Promise(resolve => setTimeout(resolve, answer.delayMs));
    return new Response(JSON.stringify(answer.body ?? { hits: null }), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body));
}

const filters = (overrides: Partial<TaggedClaimFilters> = {}): TaggedClaimFilters => ({
  ...NO_TAGGED_CLAIM_FILTERS,
  search: 'trump affair',
  topicIds: [TOPIC],
  spaceIds: [SPACE],
  eligibleSpaceIds: [SPACE, 'b'.repeat(32)],
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveSemanticSearch', () => {
  it('is off with nothing typed or the list not asked', () => {
    expect(resolveSemanticSearch({ search: '', enabled: true, status: 'success', hits: HITS })).toEqual({
      mode: 'off',
      hits: null,
    });
    expect(resolveSemanticSearch({ search: 'q', enabled: false, status: 'success', hits: HITS }).mode).toBe('off');
  });

  it('is pending until geo-lens answers', () => {
    expect(resolveSemanticSearch({ search: 'q', enabled: true, status: 'pending', hits: undefined }).mode).toBe(
      'pending'
    );
  });

  it('falls back to the words on an error, an empty answer, or an unconfigured route', () => {
    for (const args of [
      { status: 'error' as const, hits: undefined },
      { status: 'success' as const, hits: [] },
      { status: 'success' as const, hits: null },
    ]) {
      expect(resolveSemanticSearch({ search: 'q', enabled: true, ...args })).toEqual({ mode: 'text', hits: null });
    }
  });

  it('is semantic with hits', () => {
    expect(resolveSemanticSearch({ search: 'q', enabled: true, status: 'success', hits: HITS })).toEqual({
      mode: 'semantic',
      hits: HITS,
    });
  });
});

describe('sameTaggedFilters', () => {
  it('compares by value, hits included', () => {
    expect(sameTaggedFilters(filters(), filters())).toBe(true);
    expect(sameTaggedFilters(filters({ semanticHits: HITS }), filters({ semanticHits: [...HITS] }))).toBe(true);
    expect(sameTaggedFilters(filters(), filters({ search: 'other' }))).toBe(false);
    expect(sameTaggedFilters(filters(), filters({ semanticHits: HITS }))).toBe(false);
    expect(sameTaggedFilters(filters(), filters({ eligibleSpaceIds: null }))).toBe(false);
  });
});

describe('useSemanticTaggedFilters', () => {
  it('asks the route over the tag, the eligible spaces and the topics — never the picked spaces', async () => {
    const fetchMock = stubRoute({ body: { hits: HITS } });
    // A fresh filters object every render, on purpose: the hook must settle rather than re-hold.
    const { result } = renderHook(() => useSemanticTaggedFilters(TAG, filters(), true), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('semantic'));
    expect(sentBody(fetchMock)).toEqual({
      query: 'trump affair',
      tagId: TAG,
      spaceIds: [SPACE, 'b'.repeat(32)],
      topicIds: [TOPIC],
    });
    // the hits ride on the filters; the words and every other filter stay as they were
    expect(result.current.filters).toEqual({ ...filters(), semanticHits: HITS });
    expect(result.current.pending).toBe(false);
  });

  it('hands the words through when geo-lens finds nothing', async () => {
    stubRoute({ body: { hits: [] } });
    const typed = filters();
    const { result } = renderHook(() => useSemanticTaggedFilters(TAG, typed, true), { wrapper });

    await waitFor(() => expect(result.current.mode).toBe('text'));
    expect(result.current.filters).toEqual({ ...filters(), semanticHits: null });
  });

  it('hands the words through when the route is not configured, or fails', async () => {
    const typed = filters();
    stubRoute({ body: { hits: null } });
    const off = renderHook(() => useSemanticTaggedFilters(TAG, typed, true), { wrapper });
    await waitFor(() => expect(off.result.current.mode).toBe('text'));
    expect(off.result.current.filters.semanticHits).toBeNull();

    stubRoute({ status: 502, body: { error: 'down' } });
    const failed = renderHook(() => useSemanticTaggedFilters(TAG, typed, true), { wrapper });
    await waitFor(() => expect(failed.result.current.mode).toBe('text'));
    expect(failed.result.current.filters).toEqual({ ...filters(), semanticHits: null });
  });

  it('does not ask with nothing typed, and passes the filters through', () => {
    const fetchMock = stubRoute({ body: { hits: HITS } });
    const empty = filters({ search: '' });
    const { result } = renderHook(() => useSemanticTaggedFilters(TAG, empty, true), { wrapper });

    expect(result.current).toEqual({ filters: { ...empty, semanticHits: null }, pending: false, mode: 'off' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the tag, not the words, while a search present at mount is being asked', () => {
    stubRoute({ body: { hits: HITS }, delayMs: 50 });
    const typed = filters();
    const { result } = renderHook(() => useSemanticTaggedFilters(TAG, typed, true), { wrapper });

    expect(result.current.pending).toBe(true);
    expect(result.current.filters).toEqual({ ...typed, search: '', semanticHits: null });
  });

  it('does not ask for a list that is not being shown', () => {
    const fetchMock = stubRoute({ body: { hits: HITS } });
    const typed = filters();
    const { result } = renderHook(() => useSemanticTaggedFilters(TAG, typed, false), { wrapper });

    expect(result.current.mode).toBe('off');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('holds the previous answer while the next one is being asked', async () => {
    stubRoute({ body: { hits: HITS } });
    const { result, rerender } = renderHook(
      ({ current }: { current: TaggedClaimFilters }) => useSemanticTaggedFilters(TAG, current, true),
      { wrapper, initialProps: { current: filters() } }
    );
    await waitFor(() => expect(result.current.mode).toBe('semantic'));
    const settled = result.current.filters;

    stubRoute({ body: { hits: [] }, delayMs: 50 });
    const retyped = filters({ search: 'trump affair allegations' });
    rerender({ current: retyped });

    // pending: the rows stay on the answer in hand, and the counts are told so
    expect(result.current.pending).toBe(true);
    expect(result.current.filters).toBe(settled);

    await waitFor(() => expect(result.current.mode).toBe('text'));
    expect(result.current.filters).toEqual({ ...retyped, semanticHits: null });
  });
});
