import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';

import { isClaimSpaceAllowed } from './claim-space-allowlist';
import { useClaimSpaceAllowlist } from './use-claim-space-allowlist';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const PERSONAL = '019fedae-72b6-7ab2-927a-df044d57c560';
const FEATURED = '019fedae-72b6-7ab2-927a-df044d57c566';
const MEMBER = '019fedae-72b6-7ab2-927a-df044d57c567';

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

beforeEach(() => {
  mocks.source = { personalSpaceId: null, walletAddress: undefined, keyInput: null, isLoading: false };
  mocks.fetchBrowseSidebarData.mockReset().mockResolvedValue(sidebarData());
  mocks.loadBrowseSidebarData.mockReset().mockResolvedValue(sidebarData());
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

  it('picks the cached sidebar up as soon as the account settles', () => {
    mocks.source = { personalSpaceId: null, walletAddress: WALLET, keyInput: WALLET, isLoading: false };
    const { result } = renderWithCache(WALLET, sidebarData());

    expect(isClaimSpaceAllowed(FEATURED, result.current.allowlist)).toBe(true);
    // Answered off the cache — the sidebar's own fetch is not repeated here.
    expect(mocks.fetchBrowseSidebarData).not.toHaveBeenCalled();
    expect(mocks.loadBrowseSidebarData).not.toHaveBeenCalled();
  });
});
