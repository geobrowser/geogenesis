import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A plain function rather than a `vi.fn()`: a spy records a thrown result, and with a `beforeEach`
 * registered in the file vitest reports that recorded throw as a failure of the test that caused
 * it — even though the code under test catches it, which is the whole point here.
 */
const state = vi.hoisted(() => ({ sidebar: null as null | (() => unknown) }));

const cookieJar = vi.hoisted(() => ({ read: vi.fn((): { value: string } | undefined => undefined) }));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookieJar.read() }) }));
vi.mock('~/core/browse/fetch-browse-sidebar-data', () => ({
  fetchBrowseSidebarData: async () => state.sidebar!(),
}));
vi.mock('~/core/browse/resolve-member-space-from-wallet', () => ({
  resolveMemberSpaceFromWalletSafe: async () => {
    memberLookups.count += 1;
    return 'member-space';
  },
}));
vi.mock('~/app/home/governance-home-space-ids', () => ({
  getGovernanceHomeSpaceContext: async () => ({ editorIds: [], myProposalSpaceIds: [] }),
}));

const memberLookups = { count: 0 };

const { resolveExploreFeedRequestContext } = await import('./resolve-explore-feed-request-context');

beforeEach(() => {
  state.sidebar = null;
  memberLookups.count = 0;
  cookieJar.read.mockReset();
  cookieJar.read.mockReturnValue(undefined);
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

// The CDN keys on the URL and ignores cookies, so the cacheable feed page must not depend on them.
describe('the anonymous request', () => {
  const sidebar = () => ({ featured: [], editorOf: [], memberOf: [], documentationImage: null, personalSpaceId: null });

  it('reads the wallet cookie by default', async () => {
    cookieJar.read.mockReturnValue({ value: '0xabc' });
    state.sidebar = sidebar;

    const context = await resolveExploreFeedRequestContext();

    expect(context.walletAddress).toBe('0xabc');
    expect(context.personalMemberSpaceId).toBe('member-space');
  });

  it('ignores the cookie jar entirely', async () => {
    cookieJar.read.mockReturnValue({ value: '0xabc' });
    state.sidebar = sidebar;

    const context = await resolveExploreFeedRequestContext(undefined, { anonymous: true });

    expect(cookieJar.read).not.toHaveBeenCalled();
    expect(memberLookups.count).toBe(0);
    expect(context).toMatchObject({ walletAddress: null, personalMemberSpaceId: null, memberOrEditorSpaceIds: [] });
  });
});
