import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRESH_SLOT_CONFIG } from './fresh-slot/fresh-slot-config';

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  browse: {} as Record<string, unknown>,
  warm: vi.fn(),
  recent: [] as unknown[],
  recentArgs: undefined as unknown,
}));
vi.mock('./fresh-slot/recent-fresh-scopes', () => ({
  readRecentFreshScopes: async (args: unknown) => {
    mocks.recentArgs = args;
    const { limit } = args as { limit: number };
    return mocks.recent.slice(0, limit);
  },
}));

vi.mock('./fresh-slot/fresh-slot-store', () => ({
  readServingFreshSlotState: async () => ({ config: mocks.config }),
}));
vi.mock('~/core/browse/fetch-browse-sidebar-data', () => ({
  fetchBrowseSidebarData: async () => mocks.browse,
}));
vi.mock('./fetch-explore-feed', async () => {
  const actual = await vi.importActual<typeof import('./fetch-explore-feed')>('./fetch-explore-feed');
  return { ...actual, warmSharedFreshList: (args: unknown) => mocks.warm(args) };
});

const { WARM_SCOPES, warmRecentScopes } = await import('./warm-fresh-lists');
const { DEFAULT_EXPLORE_TYPE_IDS } = await import('./explore-constants');

const scope = WARM_SCOPES[0]!;

beforeEach(() => {
  mocks.warm.mockReset().mockResolvedValue(undefined);
  mocks.config = { ...DEFAULT_FRESH_SLOT_CONFIG, enabled: true, maxPerPage: 3, freshnessHours: 24 };
  mocks.browse = {
    featured: [
      { id: 'a'.repeat(32), name: 'A', image: null },
      { id: 'b'.repeat(32), name: 'B', image: null },
    ],
    editorOf: [],
    memberOf: [],
    documentationImage: null,
    personalSpaceId: null,
  };
});

describe('the signed-out default scope', () => {
  it('warms the scope the feed route derives for a request with no parameters', async () => {
    expect(await scope.warm()).toBe('warmed');
    expect(mocks.warm).toHaveBeenCalledWith({
      spaceIds: ['a'.repeat(32), 'b'.repeat(32)],
      time: 'all',
      typeIds: [...DEFAULT_EXPLORE_TYPE_IDS],
      requireName: true,
      requireDebateTagOnClaims: true,
      freshnessHours: 24,
    });
  });

  it('does nothing while the fresh slot is off, as the request path builds no list then', async () => {
    mocks.config = { ...mocks.config, enabled: false };
    expect(await scope.warm()).toBe('skipped');
    expect(mocks.warm).not.toHaveBeenCalled();
  });

  it('fails rather than warming an empty scope when the Featured spaces did not load', async () => {
    mocks.browse = { ...mocks.browse, featured: [], featuredError: true };
    await expect(scope.warm()).rejects.toThrow();
    expect(mocks.warm).not.toHaveBeenCalled();
  });
});

describe('warming the recently requested scopes', () => {
  const recorded = (n: number) => ({
    spaceIds: [String(n).padStart(32, '0'), 'a'.repeat(32)],
    typeIds: [...DEFAULT_EXPLORE_TYPE_IDS],
    time: 'all',
    requireName: true,
    requireDebateTagOnClaims: true,
    freshnessHours: 24,
  });

  it('warms at most the limit, newest first, inside the recency window', async () => {
    mocks.recent = Array.from({ length: 15 }, (_, i) => recorded(i + 1));
    const results = await warmRecentScopes({ now: () => 1_000_000 });
    expect(results).toHaveLength(10);
    expect(mocks.warm).toHaveBeenCalledTimes(10);
    expect(mocks.recentArgs).toEqual({ nowMs: 1_000_000, windowMs: 30 * 60_000, limit: 10 });
  });

  it('passes the recorded inputs to the same warm function the default scope uses', async () => {
    mocks.recent = [recorded(1)];
    await warmRecentScopes();
    expect(mocks.warm).toHaveBeenCalledWith({
      spaceIds: recorded(1).spaceIds,
      time: 'all',
      typeIds: [...DEFAULT_EXPLORE_TYPE_IDS],
      requireName: true,
      requireDebateTagOnClaims: true,
      freshnessHours: 24,
    });
  });

  it('runs at most the concurrency at once', async () => {
    mocks.recent = Array.from({ length: 8 }, (_, i) => recorded(i + 1));
    let running = 0;
    let peak = 0;
    mocks.warm.mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 5));
      running -= 1;
    });
    await warmRecentScopes({ concurrency: 3 });
    expect(peak).toBe(3);
    expect(mocks.warm).toHaveBeenCalledTimes(8);
  });

  it('starts no new scope once the time budget is spent', async () => {
    mocks.recent = Array.from({ length: 6 }, (_, i) => recorded(i + 1));
    let clock = 0;
    mocks.warm.mockImplementation(async () => {
      clock += 10_000;
    });
    const results = await warmRecentScopes({ concurrency: 1, budgetMs: 25_000, now: () => clock });
    // Starts at 0, 10s, 20s; at 30s the budget is spent.
    expect(results).toHaveLength(3);
    expect(mocks.warm).toHaveBeenCalledTimes(3);
  });

  it('skips a recorded scope equal to the signed-out default, and reports a failure without stopping', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.recent = [
      { ...recorded(1), spaceIds: ['b'.repeat(32), 'a'.repeat(32)] }, // the default scope, reordered
      recorded(2),
      recorded(3),
    ];
    mocks.warm.mockRejectedValueOnce(new Error('gaia down'));
    const results = await warmRecentScopes({ concurrency: 1 });
    expect(results.map(result => result.status)).toEqual(['failed', 'warmed']);
    warn.mockRestore();
  });

  it('does nothing while the fresh slot is off', async () => {
    mocks.recent = [recorded(1)];
    mocks.config = { ...mocks.config, enabled: false };
    expect(await warmRecentScopes()).toEqual([]);
    expect(mocks.warm).not.toHaveBeenCalled();
  });
});
