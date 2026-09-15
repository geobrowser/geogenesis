import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { getDefaultStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { REQUEST_BRIDGE_TTL_MS, requestedMembershipSpacesAtom } from '~/core/state/requested-membership';
import { normId } from '~/core/utils/norm-id';

import { REQUESTED_MEMBERSHIP_SETTLE_MS } from './claim-space-allowlist';
import { isClaimSpaceAllowed } from './claim-space-allowlist';
import { useClaimSpaceAllowlist } from './use-claim-space-allowlist';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const PERSONAL = '019fedae-72b6-7ab2-927a-df044d57c560';
const FEATURED = '019fedae-72b6-7ab2-927a-df044d57c566';
const MEMBER = '019fedae-72b6-7ab2-927a-df044d57c567';
const REQUESTED = '019fedae-72b6-7ab2-927a-df044d57c568';
const OTHER_WALLET = '0xfedcba9876543210fedcba9876543210fedcba98';

const mocks = vi.hoisted(() => ({
  source: {
    personalSpaceId: null as string | null,
    walletAddress: undefined as string | undefined,
    keyInput: null as string | null,
    isLoading: false,
  },
  fetchBrowseSidebarData: vi.fn(),
  loadBrowseSidebarData: vi.fn(),
}));

vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => mocks.source,
}));

vi.mock('~/core/browse/fetch-browse-sidebar-data', () => ({
  fetchBrowseSidebarData: mocks.fetchBrowseSidebarData,
}));

vi.mock('~/partials/browse-sidebar/load-browse-sidebar-data', () => ({
  loadBrowseSidebarData: mocks.loadBrowseSidebarData,
}));

function sidebarData(overrides: Partial<BrowseSidebarData> = {}): BrowseSidebarData {
  return {
    featured: [{ id: FEATURED, name: 'Crypto', image: null }],
    editorOf: [],
    memberOf: [{ id: MEMBER, name: 'Health', image: null }],
    documentationImage: null,
    personalSpaceId: PERSONAL,
    ...overrides,
  };
}

/** Renders the hook against a cache already holding `cached` under `key`. */
function renderWithCache(key: string | null, cached: BrowseSidebarData | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) queryClient.setQueryData(browseSidebarDataQueryKey(key), cached);

  return renderHook(() => useClaimSpaceAllowlist(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

/** Seeds the optimistic "Membership pending" bridge onboarding and the Join buttons write to. */
function bridgeRequest(spaceId: string, ownerId: string, requestedAt = Date.now()) {
  getDefaultStore().set(requestedMembershipSpacesAtom, [{ id: spaceId, ownerId, requestedAt }]);
}

beforeEach(() => {
  mocks.source = { personalSpaceId: null, walletAddress: undefined, keyInput: null, isLoading: false };
  mocks.fetchBrowseSidebarData.mockReset().mockResolvedValue(sidebarData());
  mocks.loadBrowseSidebarData.mockReset().mockResolvedValue(sidebarData());
  getDefaultStore().set(requestedMembershipSpacesAtom, []);
});

afterEach(cleanup);

describe('useClaimSpaceAllowlist', () => {
  it('builds the allowlist from the sidebar data once the account has settled', () => {
    mocks.source = { personalSpaceId: PERSONAL, walletAddress: WALLET, keyInput: PERSONAL, isLoading: false };
    const { result } = renderWithCache(PERSONAL, sidebarData());

    expect(isClaimSpaceAllowed(FEATURED, result.current.allowlist)).toBe(true);
    expect(isClaimSpaceAllowed(MEMBER, result.current.allowlist)).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  // `enabled: false` stops the fetch but not the read: a cache entry already under this key comes
  // back synchronously. Mid-resolution that key is a partial identity, so a leftover signed-out
  // sidebar would answer here and pass for a settled allowlist — the viewer's own spaces filtered
  // out of their own panel, with nothing marking it as still loading.
  it('ignores a cache entry sitting under the key while the account is still resolving', () => {
    mocks.source = { personalSpaceId: null, walletAddress: undefined, keyInput: null, isLoading: true };
    const featuredOnly = sidebarData({ memberOf: [], personalSpaceId: null });
    const { result } = renderWithCache(null, featuredOnly);

    expect(result.current.allowlist).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  // The pairing callers read as "still resolving" — null plus loading. Anything else is an answer.
  it('reports a null allowlist as still loading, not as an empty one', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: true };
    const { result } = renderWithCache(WALLET, sidebarData());

    expect(result.current.allowlist === null && result.current.isLoading).toBe(true);
  });

  // GEO-2834. A new account picks its spaces minutes before the server can report them: the
  // personal space has to land on-chain, the membership proposals are fired after that, and the
  // indexer trails those again. Until this the sidebar payload was the only source, so every
  // membership-derived filter opened unfiltered until the reader refreshed the page.
  it('counts a space the viewer has asked to join before the server reports it', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: false };
    // Onboarding seeds the bridge under the wallet address — the personal space id does not exist
    // yet when the picks are made.
    bridgeRequest(REQUESTED, WALLET);
    const { result } = renderWithCache(WALLET, sidebarData({ memberOf: [], personalSpaceId: null }));

    expect(result.current.memberSpaceIds?.has(normId(REQUESTED))).toBe(true);
    // Kept a superset: a space that counts as the viewer's has to be one they may see claims from.
    expect(isClaimSpaceAllowed(REQUESTED, result.current.allowlist)).toBe(true);
  });

  it('widens the server answer rather than replacing it', () => {
    mocks.source = { personalSpaceId: PERSONAL, walletAddress: WALLET, keyInput: PERSONAL, isLoading: false };
    bridgeRequest(REQUESTED, PERSONAL);
    const { result } = renderWithCache(PERSONAL, sidebarData());

    expect(result.current.memberSpaceIds?.has(normId(MEMBER))).toBe(true);
    expect(result.current.memberSpaceIds?.has(normId(REQUESTED))).toBe(true);
  });

  it('ignores a bridge entry left behind by another account', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: false };
    bridgeRequest(REQUESTED, OTHER_WALLET);
    const { result } = renderWithCache(WALLET, sidebarData({ memberOf: [], personalSpaceId: null }));

    expect(result.current.memberSpaceIds?.has(normId(REQUESTED))).toBe(false);
  });

  it('ignores a bridge entry past its TTL', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: false };
    bridgeRequest(REQUESTED, WALLET, Date.now() - REQUEST_BRIDGE_TTL_MS - 1);
    const { result } = renderWithCache(WALLET, sidebarData({ memberOf: [], personalSpaceId: null }));

    expect(result.current.memberSpaceIds?.has(normId(REQUESTED))).toBe(false);
  });

  // The bridge widens a resolved answer; it does not stand in for one. The default it feeds is
  // spent the first time it matches, so answering off a handful of local ids while the real list
  // is in flight could spend it on one space and drop the viewer's other memberships for the visit.
  //
  // Both legs of the gate are checked with the wallet known — that is how the bridge got seeded in
  // the first place. With it unset the owner filter drops the entry on its own and the gate is
  // never reached, so the assertion would hold whether or not the gate exists.
  it('does not answer from the bridge alone while the personal space is still resolving', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: true };
    bridgeRequest(REQUESTED, WALLET);
    const { result } = renderWithCache(WALLET, sidebarData());

    expect(result.current.memberSpaceIds).toBeNull();
    expect(result.current.allowlist).toBeNull();
  });

  it('does not answer from the bridge alone before the sidebar payload arrives', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: false };
    bridgeRequest(REQUESTED, WALLET);
    const { result } = renderWithCache(WALLET, undefined);

    expect(result.current.memberSpaceIds).toBeNull();
    expect(result.current.allowlist).toBeNull();
  });

  // The GEO-2834 sequence itself: the picks are seeded under the wallet while the account is still
  // resolving, and have to land the moment it does — without a refresh.
  it('applies the bridge as soon as the account settles', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: true };
    bridgeRequest(REQUESTED, WALLET);
    const { result, rerender } = renderWithCache(WALLET, sidebarData({ memberOf: [], personalSpaceId: null }));

    expect(result.current.memberSpaceIds).toBeNull();

    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: false };
    rerender();

    expect(result.current.memberSpaceIds?.has(normId(REQUESTED))).toBe(true);
    expect(result.current.allowlist?.has(normId(REQUESTED))).toBe(true);
  });

  // Both deadlines are read off a clock sampled during render, and the membership poll — the only
  // thing reliably re-rendering this hook — stops at the settle deadline. Without a timer of its
  // own the hook would never observe either boundary passing.
  it('retires a bridge entry on its TTL with nothing else re-rendering', () => {
    vi.useFakeTimers();
    try {
      mocks.source = { personalSpaceId: PERSONAL, walletAddress: WALLET, keyInput: PERSONAL, isLoading: false };
      bridgeRequest(REQUESTED, PERSONAL);
      const { result } = renderWithCache(PERSONAL, sidebarData({ memberOf: [] }));

      expect(result.current.memberSpaceIds?.has(normId(REQUESTED))).toBe(true);

      act(() => void vi.advanceTimersByTime(REQUEST_BRIDGE_TTL_MS + 10));

      expect(result.current.memberSpaceIds?.has(normId(REQUESTED))).toBe(false);
      expect(result.current.allowlist?.has(normId(REQUESTED))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // The same boundary on the other flag: a request that never lands has to stop holding the
  // default it gates, or the filter it feeds stays unspent for the rest of the visit.
  it('stops settling on the deadline with nothing else re-rendering', () => {
    vi.useFakeTimers();
    try {
      mocks.source = { personalSpaceId: PERSONAL, walletAddress: WALLET, keyInput: PERSONAL, isLoading: false };
      bridgeRequest(REQUESTED, PERSONAL);
      const { result } = renderWithCache(PERSONAL, sidebarData({ memberOf: [] }));

      expect(result.current.isSettlingMemberships).toBe(true);

      act(() => void vi.advanceTimersByTime(REQUESTED_MEMBERSHIP_SETTLE_MS + 10));

      expect(result.current.isSettlingMemberships).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('picks the cached sidebar up as soon as the account settles', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: false };
    const { result } = renderWithCache(WALLET, sidebarData());

    expect(isClaimSpaceAllowed(FEATURED, result.current.allowlist)).toBe(true);
    // Answered off the cache — the sidebar's own fetch is not repeated here.
    expect(mocks.fetchBrowseSidebarData).not.toHaveBeenCalled();
    expect(mocks.loadBrowseSidebarData).not.toHaveBeenCalled();
  });
});
