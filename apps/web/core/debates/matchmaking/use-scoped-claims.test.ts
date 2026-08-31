import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingClaimsQuery } from '../api';
import { useScopedMatchmakingClaims } from './use-scoped-claims';

const mocks = vi.hoisted(() => ({
  enabled: undefined as boolean | undefined,
  query: undefined as MatchmakingClaimsQuery | undefined,
  isPlaceholderData: false,
  hasNextPage: true,
}));

// The pages a settled request would have returned, so anything empty below is the masking rather
// than an empty answer.
const PAGES = [
  { claims: [], next_cursor: null, facets: { space_ids: ['space-1'], topics: [], space_facets: [], topic_facets: [] } },
];

vi.mock('./hooks', () => ({
  useMatchmakingClaims: (query: MatchmakingClaimsQuery, enabled: boolean) => {
    mocks.query = query;
    mocks.enabled = enabled;
    return {
      data: { pages: PAGES },
      isLoading: false,
      isPlaceholderData: mocks.isPlaceholderData,
      hasNextPage: mocks.hasNextPage,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
      error: null,
    };
  },
}));

const QUERY = { search: null, spaceId: null, topicId: null } as const;

function scoped(scope: { spaceIds: string[] | null; pending: boolean }, alsoUnusable = false, selected: string[] = []) {
  return renderHook(() => useScopedMatchmakingClaims(QUERY, scope, selected, alsoUnusable));
}

beforeEach(() => {
  mocks.isPlaceholderData = false;
  mocks.hasNextPage = true;
  mocks.enabled = undefined;
  mocks.query = undefined;
});

describe('useScopedMatchmakingClaims', () => {
  it('answers with the pages when the scope is known and non-empty', () => {
    const { result } = scoped({ spaceIds: ['space-1'], pending: false });

    expect(result.current.pages).toEqual(PAGES);
    expect(result.current.facets).toBeDefined();
    expect(mocks.enabled).toBe(true);
    expect(mocks.query).toMatchObject({ spaceIds: ['space-1'] });
  });

  // `null` is "not narrowed", which the server reads the same way — so it is a real question to ask.
  it('asks unnarrowed when the scope is null', () => {
    const { result } = scoped({ spaceIds: null, pending: false });

    expect(mocks.enabled).toBe(true);
    expect(result.current.pages).toEqual(PAGES);
  });

  // The four ways an answer can describe a wider corpus than the caller will show. Each was found
  // separately in review; they are one condition now.
  it.each([
    ['the scope is empty', { spaceIds: [], pending: false }, false],
    ['the scope is not known yet', { spaceIds: null, pending: true }, false],
    ['the caller has its own reason', { spaceIds: ['space-1'], pending: false }, true],
  ])('shows nothing while %s', (_why, scope, alsoUnusable) => {
    const { result } = scoped(scope, alsoUnusable);

    expect(result.current.pages).toEqual([]);
    expect(result.current.facets).toBeUndefined();
    expect(result.current.hasNextPage).toBe(false);
  });

  it('shows nothing while the pages belong to a scope the viewer has left', () => {
    const { result, rerender } = renderHook(
      ({ spaceIds, placeholder }) => {
        mocks.isPlaceholderData = placeholder;
        return useScopedMatchmakingClaims(QUERY, { spaceIds, pending: false }, []);
      },
      { initialProps: { spaceIds: ['space-1'] as string[] | null, placeholder: false } }
    );
    expect(result.current.pages).toEqual(PAGES);

    rerender({ spaceIds: ['space-2'], placeholder: true });

    expect(result.current.pages).toEqual([]);
    expect(result.current.facets).toBeUndefined();
  });

  // An empty scope is not no scope: the request is never made, rather than made unnarrowed.
  it('never asks unnarrowed for a scope known to be empty', () => {
    scoped({ spaceIds: [], pending: false });

    expect(mocks.enabled).toBe(false);
  });

  // The picked spaces replace the scope rather than joining it: geo-chat ORs the space parameters,
  // so sending both would ask about every space in the scope alongside the one that was picked.
  it('asks about the picked spaces rather than the whole scope', () => {
    scoped({ spaceIds: ['space-1', 'space-2', 'space-3'], pending: false }, false, ['space-2']);

    expect(mocks.query).toMatchObject({ spaceIds: ['space-2'] });
  });

  it('falls back to the scope when nothing is picked', () => {
    scoped({ spaceIds: ['space-1', 'space-2'], pending: false }, false, []);

    expect(mocks.query).toMatchObject({ spaceIds: ['space-1', 'space-2'] });
  });

  // A scope that can show nothing is a finished answer about the menu: empty. Read as "not known
  // yet" instead, a selection made before the scope narrowed would be held forever, filtering an
  // empty list from a chip the empty menu can't unpick.
  it('calls an unusable scope settled, so a stranded selection can be let go', () => {
    expect(scoped({ spaceIds: [], pending: false }).result.current.facetsSettled).toBe(true);
    expect(scoped({ spaceIds: ['space-1'], pending: false }, true).result.current.facetsSettled).toBe(true);
  });

  // The mirror of the rule above, and the same reason. A disabled query is never refetched, but
  // React Query still hands back the previous key's rows as placeholder data when the key moves
  // under it — so read as pending, the counts would wait forever on a request nobody is making,
  // and the menu would sit on skeletons over client-derived counts that are already right.
  it('reports no pending counts for a query it never makes', () => {
    mocks.isPlaceholderData = true;

    expect(scoped({ spaceIds: [], pending: false }).result.current.countsPending).toBe(false);
    expect(scoped({ spaceIds: ['space-1'], pending: false }, true).result.current.countsPending).toBe(false);
  });

  // A query that *is* made still reports honestly, or the flag would mean nothing.
  it('reports pending counts while a usable query is answering', () => {
    mocks.isPlaceholderData = true;

    expect(scoped({ spaceIds: ['space-1'], pending: false }).result.current.countsPending).toBe(true);
  });

  // But only once it is known to be unusable — a scope still resolving says nothing either way.
  it('calls nothing settled while the scope is still resolving', () => {
    expect(scoped({ spaceIds: [], pending: true }).result.current.facetsSettled).toBe(false);
    expect(scoped({ spaceIds: null, pending: true }).result.current.facetsSettled).toBe(false);
  });

  // The difference between "no topics" and "not known yet", which is what stops a viewer's
  // selection being cleared on a slow load.
  it('calls the facets settled only once they answer the scope in force', () => {
    expect(scoped({ spaceIds: ['space-1'], pending: false }).result.current.facetsSettled).toBe(true);

    mocks.isPlaceholderData = true;
    expect(scoped({ spaceIds: ['space-1'], pending: false }).result.current.facetsSettled).toBe(false);
  });
});
