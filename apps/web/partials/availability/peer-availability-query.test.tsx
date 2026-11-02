import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PeerSchedule } from '~/core/availability/peer-schedule';

import { PeerAvailability } from './peer-availability';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

const usePeerSchedule = vi.fn();
vi.mock('~/core/debates/hooks', () => ({ usePeerSchedule: (...args: unknown[]) => usePeerSchedule(...args) }));

const schedule: PeerSchedule = {
  userId: 'user-peer',
  viewerTimezone: 'America/New_York',
  peerTimezone: 'Europe/Berlin',
  viewerHasSchedule: true,
  peerHasSchedule: true,
  theirWeekKnown: true,
  slots: [],
};

afterEach(() => {
  cleanup();
  usePeerSchedule.mockReset();
  capture.mockClear();
});

/** Whatever the hook does not say is whatever react-query would say beside it. */
const state = (overrides: Record<string, unknown>) =>
  usePeerSchedule.mockReturnValue({
    enabled: true,
    isPending: false,
    isError: false,
    schedule: undefined,
    ...overrides,
  });

describe('PeerAvailability', () => {
  it('asks for the peer by id and nothing else', () => {
    state({ schedule });
    render(<PeerAvailability userId="user-peer" />);
    expect(usePeerSchedule).toHaveBeenCalledWith('user-peer');
  });

  it('tells a signed-out viewer the question cannot be asked, rather than spinning forever', () => {
    // A disabled query stays `pending`, so this must not be read as loading.
    state({ enabled: false, isPending: false });
    render(<PeerAvailability userId="user-peer" />);

    expect(screen.getByText(/Sign in to see when someone is free/)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });

  it('waits rather than guessing while the viewer own schedule is still in flight', () => {
    state({ isPending: true });
    render(<PeerAvailability userId="user-peer" />);

    expect(screen.getByText(/Loading availability/)).toBeInTheDocument();
    // Specifically not the hint bar, which a premature `viewerHasSchedule: false` would raise.
    expect(screen.queryByText(/haven’t set your own availability/)).not.toBeInTheDocument();
  });

  // The overlap call can succeed while `/me/debate-schedule` fails. Reading that as "no schedule
  // set" raised the hint against someone who has one, so the hook reports it as an error instead.
  it('reports a failed viewer-schedule lookup rather than assuming no schedule', () => {
    state({ isError: true, schedule: undefined });
    render(<PeerAvailability userId="user-peer" />);

    expect(screen.getByText(/Couldn’t load their availability/)).toBeInTheDocument();
    expect(screen.queryByText(/haven’t set your own availability/)).not.toBeInTheDocument();
  });

  it('reports a failure as one', () => {
    state({ isError: true });
    render(<PeerAvailability userId="user-peer" />);
    expect(screen.getByText(/Couldn’t load their availability/)).toBeInTheDocument();
  });

  // GEO-3432: the week a reschedule opens names the debate it moves, so one abandoned is seen.
  it('names the debate a reschedule moves when the week is viewed', () => {
    state({ schedule });
    const requestId = '6676b145-0970-4c1c-bfbc-7497d9721b39';
    render(
      <PeerAvailability
        userId="user-peer"
        entry="requests_reschedule"
        booking={{ mode: 'reschedule', requestId, onRequest: vi.fn(), pending: false, error: null }}
      />
    );

    expect(capture).toHaveBeenCalledWith(
      'debate_availability_viewed',
      expect.objectContaining({ entry: 'requests_reschedule', request_id: requestId })
    );
  });

  it('draws the week once it has one', () => {
    state({ schedule });
    render(<PeerAvailability userId="user-peer" peerName="Ada" />);
    expect(screen.getByRole('heading', { name: 'When Ada is free' })).toBeInTheDocument();
  });
});
