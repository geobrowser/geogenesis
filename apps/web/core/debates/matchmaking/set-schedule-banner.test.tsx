import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';

import { SetScheduleBanner } from './set-schedule-banner';

// The banner now reads and writes the saved calendar (GEO-2932). These tests are about the
// callout and the modal opening, not the round trip, so the hooks are stubbed -- the payload
// conversion has its own tests in core/availability.
const mocks = vi.hoisted(() => ({
  isSet: false,
  blocks: [] as AvailabilityBlock[],
  loaded: true,
  authenticated: true,
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({
    data: mocks.loaded ? { is_set: mocks.isSet, schedule: { timezone: 'UTC' } } : undefined,
    blocks: mocks.loaded ? mocks.blocks : undefined,
    isSet: mocks.isSet,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, ready: true, accountKey: 'did:privy:1' }),
}));

// The editor's copy-link button reads the personal space through the wallet stack; it has its own tests.
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));

afterEach(() => {
  cleanup();
  mocks.isSet = false;
  mocks.blocks = [];
  mocks.loaded = true;
  mocks.authenticated = true;
});

const weekly: AvailabilityBlock = { id: 'r', kind: 'recurring', weekday: 0, start: 540, end: 600 };

const setup = () => ({ user: userEvent.setup(), ...render(<SetScheduleBanner />) });

describe('SetScheduleBanner', () => {
  it('shows the callout and its button', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Set my schedule' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Open schedule'
    );
    expect(screen.getByText('Debate schedule')).toBeInTheDocument();
    expect(screen.getByText(/You can change it any time in the dropdown above/)).toBeInTheDocument();
  });

  // It only leaves once there is time to book, so there is nothing to close.
  it('has no dismiss button', async () => {
    setup();
    await screen.findByRole('button', { name: 'Set my schedule' });
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('opens the availability calendar when the button is clicked', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Set my schedule' }));

    const dialog = await screen.findByRole('dialog');
    // The grid itself, not just the shell: the modal exists to hold the calendar.
    expect(within(dialog).getByRole('group', { name: 'New block mode' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save schedule' })).toBeInTheDocument();
  });

  it('closes on Cancel', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Set my schedule' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // Once there is time to book, the header's availability pill is where the schedule lives.
  it('retires once the schedule offers upcoming time', () => {
    mocks.isSet = true;
    mocks.blocks = [weekly];
    setup();

    expect(screen.queryByText('Debate schedule')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set my schedule' })).not.toBeInTheDocument();
  });

  // `is_set` stays true once anything was ever saved, so it cannot be what retires the banner.
  it('comes back for a schedule cleared back to nothing', async () => {
    mocks.isSet = true;
    setup();

    expect(await screen.findByText('Debate schedule')).toBeInTheDocument();
  });

  it('comes back once every saved time is in the past', async () => {
    mocks.isSet = true;
    mocks.blocks = [{ id: 'd', kind: 'dated', date: '2020-01-06', start: 540, end: 600 }];
    setup();

    expect(await screen.findByText('Debate schedule')).toBeInTheDocument();
  });

  // Defaulting to "unset" before the read answers would flash the banner at everyone who already
  // has a schedule, every time the panel opens.
  it('waits for the schedule read before showing', () => {
    mocks.loaded = false;
    setup();

    expect(screen.queryByText('Debate schedule')).not.toBeInTheDocument();
  });

  // Signed out the read is disabled, so the modal it opens would sit on "Loading your schedule"
  // with nothing coming.
  it('does not render signed out', () => {
    mocks.authenticated = false;
    setup();

    expect(screen.queryByText('Debate schedule')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set my schedule' })).not.toBeInTheDocument();
  });

  // The calendar page shows the same callout, with its clicks labelled as the calendar's.
  it("labels the calendar page's callout as the calendar's", async () => {
    render(<SetScheduleBanner surface="calendar" />);

    expect(await screen.findByRole('button', { name: 'Set my schedule' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate calendar Open schedule'
    );
  });
});

// A save that retires the banner takes the focused control with it, so focus goes up to the
// header's availability pill — the schedule's standing home. A save that leaves it up does not.
describe('SetScheduleBanner focus hand-off', () => {
  function Harness() {
    const scheduleButtonRef = React.useRef<HTMLButtonElement | null>(null);
    return (
      <>
        <button ref={scheduleButtonRef} type="button">
          Header calendar
        </button>
        <SetScheduleBanner scheduleButtonRef={scheduleButtonRef} />
      </>
    );
  }

  const setupWithHeader = () => ({ user: userEvent.setup(), ...render(<Harness />) });

  // Saving an empty week offers nothing, so the banner stays and keeps focus.
  it('returns focus to its own button after a save with no upcoming time', async () => {
    const { user } = setupWithHeader();
    const opener = await screen.findByRole('button', { name: 'Set my schedule' });
    await user.click(opener);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  // Cancel does not retire anything, so focus goes back where it came from, as any dialog's does.
  it('still returns focus to its own button on Cancel', async () => {
    const { user } = setupWithHeader();
    const opener = await screen.findByRole('button', { name: 'Set my schedule' });
    await user.click(opener);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
