import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SpaceCallsResponse } from '~/core/space-calls/api';

const mocks = vi.hoisted(() => ({
  flag: true,
  calls: undefined as SpaceCallsResponse | undefined,
  isError: false,
  search: '',
}));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('~/core/space-calls/hooks', () => ({
  useSpaceCalls: () => ({ data: mocks.calls, isError: mocks.isError }),
}));
vi.mock('~/core/debates/lobbies/lobby-people', () => ({ LobbyAvatarStack: () => null }));
vi.mock('./past-calls-section', () => ({ PastCallsSection: () => <section aria-label="Past" /> }));
vi.mock('./call-remind', () => ({ CallRemind: () => <button type="button">Remind me</button> }));

const { SpaceCallsTab } = await import('./space-calls-tab');

afterEach(() => {
  cleanup();
  mocks.flag = true;
  mocks.calls = undefined;
  mocks.isError = false;
  mocks.search = '';
});

const live = {
  call_id: 'call1',
  name: 'Weekly call',
  started_at: '2026-10-23T15:00:02Z',
  started_by: null,
  hosts: [],
  headcount: 2,
  avatars: [],
  as_of: '2026-10-23T15:04:11Z',
};

describe('SpaceCallsTab', () => {
  it('says calls are off with the flag off', () => {
    mocks.flag = false;
    render(<SpaceCallsTab spaceId="space1" />);
    expect(screen.getByText('Calls are not available yet.')).toBeInTheDocument();
  });

  it('lists the live call with Join', () => {
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: null, calls: [live] };
    render(<SpaceCallsTab spaceId="space1" />);
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/space/space1/calls/call1');
    expect(screen.getByText('No calls scheduled.')).toBeInTheDocument();
    expect(screen.queryByText('Schedule a call')).not.toBeInTheDocument();
  });

  it('lists scheduled calls with Remind me, then Past', () => {
    mocks.calls = {
      space_id: 'space1',
      supported: true,
      viewer_can_start: null,
      calls: [{ ...live, call_id: 'next', status: 'scheduled', name: 'Next call', as_of: null }],
      viewer: null,
    };
    render(<SpaceCallsTab spaceId="space1" />);
    expect(screen.getByRole('link', { name: 'Next call' })).toHaveAttribute('href', '/space/space1/calls/next');
    expect(screen.getByRole('button', { name: 'Remind me' })).toBeInTheDocument();
    expect(screen.getByText('No call is live right now.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Past' })).toBeInTheDocument();
  });

  it('offers an editor scheduling', () => {
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: true, calls: [] };
    render(<SpaceCallsTab spaceId="space1" />);
    expect(screen.getByRole('link', { name: 'Schedule a call' })).toHaveAttribute(
      'href',
      '/space/space1/community/new'
    );
    expect(screen.getByText('No call is live right now.')).toBeInTheDocument();
  });

  it('says a proposal is waiting on governance rather than scheduled', () => {
    mocks.search = 'scheduled=series1&outcome=pending';
    mocks.calls = { space_id: 'space1', supported: true, viewer_can_start: true, calls: [] };
    render(<SpaceCallsTab spaceId="space1" />);
    const notice = screen.getByTestId('calls-tab-scheduled-notice');
    expect(notice).toHaveAttribute('data-outcome', 'pending');
    expect(notice).toHaveTextContent('waiting on governance');
    expect(screen.getByRole('link', { name: 'Open Governance' })).toHaveAttribute('href', '/space/space1/governance');
  });

  it('says a space without calls has none', () => {
    mocks.calls = { space_id: 'space1', supported: false, viewer_can_start: null, calls: [] };
    render(<SpaceCallsTab spaceId="space1" />);
    expect(screen.getByText('This space does not have calls.')).toBeInTheDocument();
  });
});
