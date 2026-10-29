import { afterEach, describe, expect, it, vi } from 'vitest';

import { SIDE_RAIL_FETCH_TIMEOUT_MS } from '~/core/utils/resolve-within';

const mocks = vi.hoisted(() => ({
  fetchCommunityCalls: vi.fn(),
}));

vi.mock('~/core/community-calls/fetch-community-calls', () => ({ fetchCommunityCalls: mocks.fetchCommunityCalls }));
vi.mock('~/partials/space-page/space-overview-side-panel', () => ({ SpaceOverviewSidePanel: () => null }));

const { CommunityCallsSidePanel } = await import('./community-calls-side-panel');

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';
const series = { id: 'series-1' };

afterEach(() => {
  vi.useRealTimers();
  mocks.fetchCommunityCalls.mockReset();
});

describe('CommunityCallsSidePanel', () => {
  it("hands the space's calls to the panel", async () => {
    mocks.fetchCommunityCalls.mockResolvedValue([series]);

    const panel = await CommunityCallsSidePanel({ spaceId: SPACE_ID });

    expect(mocks.fetchCommunityCalls).toHaveBeenCalledWith(SPACE_ID);
    expect(panel.props).toMatchObject({ spaceId: SPACE_ID, communityCalls: [series] });
  });

  it('renders no calls when the fetch fails', async () => {
    mocks.fetchCommunityCalls.mockRejectedValue(new Error('upstream down'));

    const panel = await CommunityCallsSidePanel({ spaceId: SPACE_ID });

    expect(panel.props.communityCalls).toEqual([]);
  });

  it('gives up on a fetch that never answers', async () => {
    vi.useFakeTimers();
    mocks.fetchCommunityCalls.mockReturnValue(new Promise(() => {}));

    const panel = CommunityCallsSidePanel({ spaceId: SPACE_ID });
    await vi.advanceTimersByTimeAsync(SIDE_RAIL_FETCH_TIMEOUT_MS);

    expect((await panel).props.communityCalls).toEqual([]);
  });
});
