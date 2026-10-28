import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSpaceSidebar: vi.fn(),
}));

vi.mock('./space-sidebar', () => ({ resolveSpaceSidebar: mocks.resolveSpaceSidebar }));
vi.mock('~/core/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/constants')>()),
  ROOT_SPACE: 'root000000000000000000000000000',
}));
vi.mock('../cached-fetch-space', () => ({ cachedFetchSpace: vi.fn() }));
vi.mock('../../(entity)/[id]/[entityId]/cached-fetch-entity', () => ({ cachedFetchEntityPage: vi.fn() }));
vi.mock('~/core/telemetry/tracked-error-boundary', () => ({ TrackedErrorBoundary: () => null }));
vi.mock('~/core/topics/browse/topic-feed', () => ({ SpaceTopicFeed: () => null }));
vi.mock('~/partials/editor/editor', () => ({ Editor: () => null }));
vi.mock('~/partials/entity-page/backlinks-server-container', () => ({ BacklinksServerContainer: () => null }));
vi.mock('~/partials/entity-page/toggle-entity-page', () => ({ ToggleEntityPage: () => null }));
vi.mock('~/partials/explore/root-explore-side-panel-container', () => ({ RootExploreSidePanelContainer: () => null }));
vi.mock('~/partials/space-page/space-debate-activity-section', () => ({ SpaceDebateActivitySection: () => null }));
vi.mock('~/partials/space-page/space-overview-side-panel-container', () => ({
  SpaceOverviewSidePanelContainer: () => null,
}));

const { SpaceOverviewBody } = await import('./space-overview-body');

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';

describe('SpaceOverviewBody', () => {
  it('renders without waiting for the community calls in its rail', async () => {
    mocks.resolveSpaceSidebar.mockReturnValue(new Promise(() => {}));
    const space = { id: SPACE_ID, entity: { id: SPACE_ID, name: 'Space', values: [], relations: [], types: [] } };

    const body = SpaceOverviewBody({ space: space as never, spaceId: SPACE_ID, tabId: undefined });
    const settled = await Promise.race([body.then(() => 'rendered'), new Promise(r => setTimeout(r, 50, 'waiting'))]);

    expect(settled).toBe('rendered');
  });
});
