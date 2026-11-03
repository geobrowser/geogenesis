import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CallSeries } from '~/core/community-calls/types';

const mocks = vi.hoisted(() => ({ spaceCalls: false }));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => (id === 'spaceCalls' ? mocks.spaceCalls : false),
}));
vi.mock('~/core/space-calls/hooks', () => ({ useSpaceCalls: () => ({ data: undefined }) }));
vi.mock('~/core/space/use-space-daily-activities', () => ({ useSpaceDailyActivityTasks: () => ({ tasks: [] }) }));
vi.mock('~/partials/community-calls/space-community-calls-section', () => ({
  SpaceCommunityCallsSection: () => <div data-testid="curator-calls" />,
}));

const { SpaceOverviewSidePanel } = await import('./space-overview-side-panel');

afterEach(() => {
  cleanup();
  mocks.spaceCalls = false;
});

describe('SpaceOverviewSidePanel community calls (GEO-3420)', () => {
  const panel = () => <SpaceOverviewSidePanel spaceId="space1" communityCalls={[{} as CallSeries]} />;

  it('lists the curator calls with community calls off', () => {
    render(panel());
    expect(screen.getByTestId('curator-calls')).toBeInTheDocument();
  });

  it('leaves them out with community calls on', () => {
    mocks.spaceCalls = true;
    render(panel());
    expect(screen.queryByTestId('curator-calls')).not.toBeInTheDocument();
  });
});
