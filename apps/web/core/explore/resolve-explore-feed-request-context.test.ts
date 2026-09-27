import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A plain function rather than a `vi.fn()`: a spy records a thrown result, and with a `beforeEach`
 * registered in the file vitest reports that recorded throw as a failure of the test that caused
 * it — even though the code under test catches it, which is the whole point here.
 */
const state = vi.hoisted(() => ({ sidebar: null as null | (() => unknown) }));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('~/core/browse/fetch-browse-sidebar-data', () => ({
  fetchBrowseSidebarData: async () => state.sidebar!(),
}));
vi.mock('~/core/browse/resolve-member-space-from-wallet', () => ({
  resolveMemberSpaceFromWalletSafe: async () => null,
}));
vi.mock('~/app/home/governance-home-space-ids', () => ({
  getGovernanceHomeSpaceContext: async () => ({ editorIds: [], myProposalSpaceIds: [] }),
}));

const { resolveExploreFeedRequestContext } = await import('./resolve-explore-feed-request-context');

beforeEach(() => {
  state.sidebar = null;
});

/**
 * The fallback this resolver reaches for when it cannot read the sidebar at all.
 *
 * It has to stay distinguishable from a reader who genuinely sees nothing, because signed out the
 * two are the same empty `featured` array — and `fetchExploreFeed` decides whether an empty feed is
 * an honest answer by asking exactly that. Without the flag, a sidebar outage reached the reader as
 * "No entities match these filters yet", the same way a shed Featured traversal used to.
 */
describe('the browse fallback', () => {
  it('reports the visible scope as unresolved when the sidebar could not be read', async () => {
    state.sidebar = () => {
      throw new Error('graph down');
    };

    const { browse } = await resolveExploreFeedRequestContext();

    expect(browse.featured).toEqual([]);
    expect(browse.featuredError).toBe(true);
  });

  it('leaves a sidebar that answered alone, however little it holds', async () => {
    state.sidebar = () => ({
      featured: [],
      editorOf: [],
      memberOf: [],
      documentationImage: null,
      personalSpaceId: null,
    });

    const { browse } = await resolveExploreFeedRequestContext();

    expect(browse.featuredError).toBeFalsy();
  });
});
