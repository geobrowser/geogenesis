import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRESH_SLOT_CONFIG } from './fresh-slot/fresh-slot-config';

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  browse: {} as Record<string, unknown>,
  warm: vi.fn(),
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

const { WARM_SCOPES } = await import('./warm-fresh-lists');
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
