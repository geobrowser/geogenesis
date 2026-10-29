import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchOverviewSubspaces: vi.fn(),
  resolveSpaceSidebar: vi.fn(),
}));

vi.mock('~/app/space/[id]/(space)/space-sidebar', () => ({
  fetchOverviewSubspaces: mocks.fetchOverviewSubspaces,
  resolveSpaceSidebar: mocks.resolveSpaceSidebar,
}));
vi.mock('./space-overview-side-panel', () => ({ SpaceOverviewSidePanel: () => null }));

const { SpaceOverviewSidePanelContainer } = await import('./space-overview-side-panel-container');

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';
const series = { id: 'series-1' };
const subspace = { id: 'topic-1' };

beforeEach(() => {
  mocks.fetchOverviewSubspaces.mockReset().mockResolvedValue([subspace]);
  mocks.resolveSpaceSidebar.mockReset().mockResolvedValue({ communityCalls: [series] });
});

describe('SpaceOverviewSidePanelContainer', () => {
  it('hands the subspaces and community calls to the panel', async () => {
    const panel = await SpaceOverviewSidePanelContainer({ spaceId: SPACE_ID });

    expect(panel.props).toMatchObject({
      spaceId: SPACE_ID,
      dailyActivities: true,
      communityCalls: [series],
      subspaces: [subspace],
    });
  });

  it('fetches both at once', () => {
    mocks.fetchOverviewSubspaces.mockReturnValue(new Promise(() => {}));
    mocks.resolveSpaceSidebar.mockReturnValue(new Promise(() => {}));

    void SpaceOverviewSidePanelContainer({ spaceId: SPACE_ID });

    expect(mocks.fetchOverviewSubspaces).toHaveBeenCalledWith(SPACE_ID);
    expect(mocks.resolveSpaceSidebar).toHaveBeenCalledWith(SPACE_ID);
  });
});
