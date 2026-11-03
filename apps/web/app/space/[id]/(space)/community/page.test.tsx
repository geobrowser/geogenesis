import { describe, expect, it, vi } from 'vitest';

vi.mock('~/core/community-calls/fetch-community-calls', () => ({ fetchCommunityCalls: () => new Promise(() => {}) }));
vi.mock('./community-calls-side-panel', () => ({ CommunityCallsSidePanel: () => new Promise(() => {}) }));
vi.mock('~/core/constants', () => ({ ROOT_SPACE: 'root000000000000000000000000000' }));
vi.mock('~/partials/community-tab/community-tab-page', () => ({ CommunityTabPage: () => null }));
vi.mock('~/partials/explore/root-explore-side-panel-container', () => ({ RootExploreSidePanelContainer: () => null }));

const { default: CommunityPage } = await import('./page');

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';

describe('Community tab', () => {
  it('renders without waiting for the community calls in its rail', async () => {
    const page = CommunityPage({ params: Promise.resolve({ id: SPACE_ID }) });
    const settled = await Promise.race([page.then(() => 'rendered'), new Promise(r => setTimeout(r, 50, 'waiting'))]);

    expect(settled).toBe('rendered');
  });
});
