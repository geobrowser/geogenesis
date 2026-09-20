import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplorePage } from './explore-page';

const mocks = vi.hoisted(() => ({ flags: {} as Record<string, boolean> }));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => mocks.flags[id] ?? false,
}));

// The panel has its own suites; this one is about whether it is rendered at all. It stands in as an
// `<aside>` because that element is the thing the layout keys on — see the reflow case below.
vi.mock('./explore-side-panel', () => ({
  ExploreSidePanel: () => <aside data-testid="explore-side-panel" />,
}));

vi.mock('./explore-welcome-banner', () => ({ ExploreWelcomeBanner: () => null }));
// Stubbed alongside its siblings above: the capture reaches Privy and wagmi for the account
// shortcut it offers (GEO-2948), and this suite is about which column the layout reserves.
vi.mock('./email-capture-popup', () => ({ ExploreEmailCapturePopup: () => null }));
vi.mock('~/partials/feed/entity-feed', () => ({ EntityFeed: () => <div data-testid="feed" /> }));

function renderExplore() {
  return render(
    <ExplorePage
      initialSpaceOptions={[]}
      memberSpaceIds={[]}
      featuredSpaces={[]}
      featuredRankings={[]}
      pendingMembershipSpaceIds={[]}
      memberOrEditorSpaceIds={[]}
      communityCalls={[]}
    />
  );
}

beforeEach(() => {
  mocks.flags = {};
});
afterEach(cleanup);

/**
 * GEO-2914. The panel is hidden on Explore, not removed — so what is pinned here is both halves:
 * that it is gone by default, and that the flag still brings back the real thing.
 */
describe('ExplorePage side panel', () => {
  it('does not render the side panel', () => {
    renderExplore();

    expect(screen.queryByTestId('explore-side-panel')).toBeNull();
    // The feed is still the page, so this is not passing on a page that failed to render.
    expect(screen.getByTestId('feed')).toBeInTheDocument();
  });

  // Hidden rather than deleted: the surface is still built and still fed by the page's own queries,
  // so the flag is the whole of what it takes to have it back.
  it('renders it again when the flag is on', () => {
    mocks.flags = { exploreSidePanel: true };
    renderExplore();

    expect(screen.getByTestId('explore-side-panel')).toBeInTheDocument();
  });

  // The reflow, asserted through its actual mechanism rather than a screenshot: the container is
  // `auto-sidebar`, which widens itself only through `has-[aside]:`. No `<aside>` in the tree is
  // what makes the content take the reclaimed width instead of holding an empty column open.
  it('leaves no aside for the layout to reserve a column for', () => {
    const { container } = renderExplore();

    expect(container.querySelector('aside')).toBeNull();
  });

  it('puts one there when the panel is back, so the container widens for it', () => {
    mocks.flags = { exploreSidePanel: true };
    const { container } = renderExplore();

    expect(container.querySelector('aside')).not.toBeNull();
  });
});
