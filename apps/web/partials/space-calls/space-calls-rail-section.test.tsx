import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SpaceCallSummary, SpaceCallsResponse } from '~/core/space-calls/api';

vi.mock('~/core/debates/lobbies/lobby-people', () => ({ LobbyAvatarStack: () => null }));
vi.mock('./call-remind', () => ({ CallRemind: () => <button type="button">Remind me</button> }));

const { SpaceCallsRailSection, hasRailCall } = await import('./space-calls-rail-section');

afterEach(cleanup);

const row = (over: Partial<SpaceCallSummary>): SpaceCallSummary => ({
  call_id: 'call1',
  name: 'Weekly',
  starts_at: '2026-11-04T16:00:00Z',
  started_by: null,
  hosts: [],
  headcount: 0,
  avatars: [],
  as_of: null,
  ...over,
});

const list = (calls: SpaceCallSummary[]): SpaceCallsResponse => ({
  space_id: 'space1',
  supported: true,
  viewer_can_start: null,
  calls,
  viewer: null,
});

describe('SpaceCallsRailSection', () => {
  it('shows the next scheduled call with Remind me and links to the Calls tab', () => {
    render(
      <SpaceCallsRailSection
        spaceId="space1"
        list={list([
          row({ call_id: 'later', status: 'scheduled', starts_at: '2026-11-11T16:00:00Z', name: 'Later' }),
          row({ call_id: 'next', status: 'scheduled', starts_at: '2026-11-04T16:00:00Z', name: 'Next' }),
        ])}
      />
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/space/space1/calls/next');
    expect(screen.queryByText('Later')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remind me' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/space/space1/calls');
  });

  it('leads with the live call', () => {
    render(
      <SpaceCallsRailSection
        spaceId="space1"
        list={list([
          row({ call_id: 'live', status: 'live', as_of: 'x' }),
          row({ call_id: 'next', status: 'scheduled' }),
        ])}
      />
    );
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/space/space1/calls/live');
  });

  it('has nothing to show without calls', () => {
    expect(hasRailCall(list([]))).toBe(false);
    expect(hasRailCall(undefined)).toBe(false);
  });
});
