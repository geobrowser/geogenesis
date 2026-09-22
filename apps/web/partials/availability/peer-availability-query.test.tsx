import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PeerSchedule } from '~/core/availability/peer-schedule';

import { PeerAvailability } from './peer-availability';

const usePeerSchedule = vi.fn();
vi.mock('~/core/debates/hooks', () => ({ usePeerSchedule: (...args: unknown[]) => usePeerSchedule(...args) }));

const schedule: PeerSchedule = {
  userId: 'user-peer',
  viewerTimezone: 'America/New_York',
  peerTimezone: 'Europe/Berlin',
  viewerHasSchedule: true,
  peerHasSchedule: true,
  slots: [],
};

afterEach(() => {
  cleanup();
  usePeerSchedule.mockReset();
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
    expect(screen.queryByText(/Set your availability/)).not.toBeInTheDocument();
  });

  // The overlap call can succeed while `/me/debate-schedule` fails. Reading that as "no schedule
  // set" raised the hint against someone who has one, so the hook reports it as an error instead.
  it('reports a failed viewer-schedule lookup rather than assuming no schedule', () => {
    state({ isError: true, schedule: undefined });
    render(<PeerAvailability userId="user-peer" />);

    expect(screen.getByText(/Couldn’t load their availability/)).toBeInTheDocument();
    expect(screen.queryByText(/Set your availability/)).not.toBeInTheDocument();
  });

  it('reports a failure as one', () => {
    state({ isError: true });
    render(<PeerAvailability userId="user-peer" />);
    expect(screen.getByText(/Couldn’t load their availability/)).toBeInTheDocument();
  });

  it('draws the week once it has one', () => {
    state({ schedule });
    render(<PeerAvailability userId="user-peer" peerName="Ada" />);
    expect(screen.getByRole('heading', { name: 'When Ada is free' })).toBeInTheDocument();
  });
});
