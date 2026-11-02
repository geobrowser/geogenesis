import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CallSeries } from '~/core/community-calls/types';

import { SpaceCommunityCallsSection } from './space-community-calls-section';

const mocks = vi.hoisted(() => ({ joinButton: vi.fn() }));

vi.mock('~/core/hooks/use-access-control', () => ({
  useAccessControl: () => ({ isMember: false, isEditor: false, isLoading: false }),
}));

// One upcoming occurrence, so the test does not depend on parsing a schedule or on the clock.
vi.mock('~/core/community-calls/occurrences', () => ({
  getOccurrences: () => [{ startMs: 2_000, endMs: 3_000 }],
  bucketOccurrences: () => ({ live: null, upcoming: [{ startMs: 2_000, endMs: 3_000 }], past: [] }),
}));

vi.mock('~/partials/explore/explore-join-space-button', () => ({
  ExploreJoinSpaceButton: (props: { spaceId: string; spaceName?: string }) => {
    mocks.joinButton(props);
    return <button>Join space</button>;
  },
}));

vi.mock('./participant-avatar-strip', () => ({ ParticipantAvatarStrip: () => null }));
vi.mock('./rsvp-button', () => ({ RsvpButton: () => null }));

const SERIES: CallSeries = {
  callId: 'call-1',
  spaceId: 'space-1',
  name: 'Weekly call',
  description: null,
  schedule: '',
};

describe('SpaceCommunityCallsSection', () => {
  afterEach(() => {
    cleanup();
    mocks.joinButton.mockClear();
  });

  it('gives the Join button the space name, so the join conversion carries it', async () => {
    render(<SpaceCommunityCallsSection spaceId="space-1" spaceName="Philosophy" series={[SERIES]} />);

    await screen.findByText('Join space');
    expect(mocks.joinButton).toHaveBeenLastCalledWith(
      expect.objectContaining({ spaceId: 'space-1', spaceName: 'Philosophy' })
    );
  });
});
