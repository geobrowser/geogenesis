import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { WATCH_LIVE_ENABLED, WatchLiveLink } from './claim-end-slot';

afterEach(cleanup);

// The slot draws none of this while `WATCH_LIVE_ENABLED` is off (GEO-3334). These pin where the
// link points, so turning it back on once live watching ships does not also revive an old bug.
describe('WatchLiveLink', () => {
  it('is off until live watching exists', () => {
    expect(WATCH_LIVE_ENABLED).toBe(false);
  });

  it('opens the room under the debate claim’s own space, not the host surface’s', () => {
    const debate = { id: 'debate-7', claim: { space_id: 'claim-space' } };
    render(<WatchLiveLink activeDebate={debate as never} spaceId="host-space" />);

    expect(screen.getByRole('link', { name: /Watch live/ }).getAttribute('href')).toBe(
      '/space/claim-space/debates/debate-7'
    );
  });

  it('points at the space’s debates when geo-chat only flags a running debate', () => {
    render(<WatchLiveLink activeDebate={true} spaceId="host-space" />);

    expect(screen.getByRole('link', { name: /Watch live/ }).getAttribute('href')).toBe('/space/host-space/debates');
  });
});
