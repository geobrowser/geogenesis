import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';

const mocks = vi.hoisted(() => ({ spaceCalls: false }));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => (id === 'spaceCalls' ? mocks.spaceCalls : false),
}));
vi.mock('~/core/hooks/use-pending-memberships', () => ({ usePendingMembershipSet: () => new Set<string>() }));
vi.mock('~/core/hooks/use-curator-onboarding-status', () => ({
  useCuratorOnboardingStatus: () => ({ isVisible: false }),
}));
vi.mock('~/partials/community-calls/explore-community-calls-section', () => ({
  ExploreCommunityCallsSection: () => <div data-testid="curator-calls" />,
}));

const { ExploreSidePanel } = await import('./explore-side-panel');

afterEach(() => {
  cleanup();
  mocks.spaceCalls = false;
});

const panel = () => (
  <ExploreSidePanel
    featuredSpaces={[]}
    featuredRankings={[]}
    pendingMembershipSpaceIds={[]}
    memberOrEditorSpaceIds={[]}
    communityCalls={[{} as ExploreCall]}
  />
);

describe('ExploreSidePanel community calls (GEO-3420)', () => {
  it('lists the curator calls with community calls off', () => {
    render(panel());
    expect(screen.getByTestId('curator-calls')).toBeInTheDocument();
  });

  it('leaves them out with community calls on, as the space rail does', () => {
    mocks.spaceCalls = true;
    const { container } = render(panel());
    expect(screen.queryByTestId('curator-calls')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
