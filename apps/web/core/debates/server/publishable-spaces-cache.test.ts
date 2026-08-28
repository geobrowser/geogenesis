import { describe, expect, it } from 'vitest';

import {
  PUBLISHABLE_SPACES_STALE_LIMIT_MS,
  PUBLISHABLE_SPACES_TTL_MS,
  isFresh,
  isServableWhenStale,
  resolvePublishableSpaces,
} from './publishable-spaces-cache';
import { editorSpacesRetryDelayMs, isTransientEditorSpacesError } from './editor-spaces';

const NOW = 1_800_000_000_000;
const entry = (ageMs: number, spaceIds = ['space-a', 'space-b']) => ({
  spaceIds,
  storedAtMs: NOW - ageMs,
});

describe('publishable spaces cache', () => {
  it('serves a fresh entry without refetching', () => {
    expect(isFresh(entry(PUBLISHABLE_SPACES_TTL_MS - 1), NOW)).toBe(true);
    expect(isFresh(entry(PUBLISHABLE_SPACES_TTL_MS + 1), NOW)).toBe(false);
    expect(isFresh(null, NOW)).toBe(false);
  });

  it('caches a successful lookup and marks it cacheable', () => {
    expect(
      resolvePublishableSpaces({ entry: null, refreshed: ['space-a'], nowMs: NOW })
    ).toEqual({ spaceIds: ['space-a'], cacheable: true });
  });

  it('treats an empty list as a real answer, not a failure', () => {
    // `[]` means "the acceptor edits nothing", which is a filter that hides everything. `null`
    // means "unknown", which is a filter that hides nothing. Collapsing the two inverts the gate.
    expect(resolvePublishableSpaces({ entry: null, refreshed: [], nowMs: NOW })).toEqual({
      spaceIds: [],
      cacheable: true,
    });
  });

  it('serves the last known good list when the refresh fails', () => {
    // The bug this exists for: a failed refresh used to answer `null`, and both client gates read
    // null as "do not filter" — so an upstream blip widened the corpus instead of narrowing it.
    expect(
      resolvePublishableSpaces({ entry: entry(PUBLISHABLE_SPACES_TTL_MS + 60_000), refreshed: null, nowMs: NOW })
    ).toEqual({ spaceIds: ['space-a', 'space-b'], cacheable: false });
  });

  it('never caches a response derived from a failure', () => {
    // Cacheability is the half that turned one 503 into hours of a dropped filter.
    for (const stored of [PUBLISHABLE_SPACES_TTL_MS + 1, PUBLISHABLE_SPACES_STALE_LIMIT_MS + 1]) {
      expect(resolvePublishableSpaces({ entry: entry(stored), refreshed: null, nowMs: NOW }).cacheable).toBe(
        false
      );
    }
  });

  it('stops serving a stale list once it is too old to trust', () => {
    // Bounded so a permanently broken upstream eventually reads as unknown rather than pinning an
    // editor set from hours ago forever.
    expect(isServableWhenStale(entry(PUBLISHABLE_SPACES_STALE_LIMIT_MS - 1), NOW)).toBe(true);
    expect(isServableWhenStale(entry(PUBLISHABLE_SPACES_STALE_LIMIT_MS + 1), NOW)).toBe(false);
    expect(
      resolvePublishableSpaces({
        entry: entry(PUBLISHABLE_SPACES_STALE_LIMIT_MS + 1),
        refreshed: null,
        nowMs: NOW,
      })
    ).toEqual({ spaceIds: null, cacheable: false });
  });

  it('answers unknown when there is nothing cached and the refresh failed', () => {
    // A cold serverless instance. Correct, and a much smaller window than a cached null.
    expect(resolvePublishableSpaces({ entry: null, refreshed: null, nowMs: NOW })).toEqual({
      spaceIds: null,
      cacheable: false,
    });
  });

  it('prefers a successful refresh over a stale entry', () => {
    expect(
      resolvePublishableSpaces({ entry: entry(60_000, ['old']), refreshed: ['new'], nowMs: NOW })
    ).toEqual({ spaceIds: ['new'], cacheable: true });
  });

  it('keeps the stale window much longer than the retry interval', () => {
    // If these crossed, a failed refresh would drop straight to null instead of serving the list
    // it already had — which is the whole point of keeping it.
    expect(PUBLISHABLE_SPACES_STALE_LIMIT_MS).toBeGreaterThan(PUBLISHABLE_SPACES_TTL_MS);
  });
});

describe('editor spaces retries', () => {
  it('retries the failure that was actually observed in production', () => {
    // GraphQL Error (Code: 503): upstream connect error or disconnect/reset before headers.
    expect(isTransientEditorSpacesError({ response: { status: 503 } })).toBe(true);
  });

  it('retries transport failures that carry no status at all', () => {
    // DNS, connection reset, timeout — a rejected query always has a status.
    expect(isTransientEditorSpacesError(new Error('socket hang up'))).toBe(true);
    expect(isTransientEditorSpacesError(null)).toBe(true);
  });

  it('does not retry a rejected query', () => {
    // A malformed query or a bad UUID fails identically on every attempt; retrying spends request
    // latency to reach the same answer.
    expect(isTransientEditorSpacesError({ response: { status: 400 } })).toBe(false);
    expect(isTransientEditorSpacesError({ response: { status: 404 } })).toBe(false);
  });

  it('retries the throttling and timeout statuses too', () => {
    expect(isTransientEditorSpacesError({ response: { status: 408 } })).toBe(true);
    expect(isTransientEditorSpacesError({ response: { status: 429 } })).toBe(true);
  });

  it('backs off without stalling the request it sits in', () => {
    expect(editorSpacesRetryDelayMs(0)).toBe(150);
    expect(editorSpacesRetryDelayMs(1)).toBe(300);
    // Two waits across three attempts, so the worst case adds well under half a second.
    expect(editorSpacesRetryDelayMs(0) + editorSpacesRetryDelayMs(1)).toBeLessThan(500);
  });
});
