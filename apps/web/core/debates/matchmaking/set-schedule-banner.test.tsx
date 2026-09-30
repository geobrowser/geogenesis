import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SetScheduleBanner } from './set-schedule-banner';

// The banner now reads and writes the saved calendar (GEO-2932). These tests are about the
// callout and the modal opening, not the round trip, so the hooks are stubbed -- the payload
// conversion has its own tests in core/availability.
const mocks = vi.hoisted(() => ({ isSet: false, loaded: true, authenticated: true }));

vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({
    data: mocks.loaded ? { is_set: mocks.isSet } : undefined,
    blocks: mocks.loaded ? [] : undefined,
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
  mocks.loaded = true;
  mocks.authenticated = true;
  // The dismissal is stored per notice id in localStorage, so a dismissal in one case would
  // otherwise hide the banner in every case after it.
  window.localStorage.clear();
});

const setup = () => ({ user: userEvent.setup(), ...render(<SetScheduleBanner />) });

describe('SetScheduleBanner', () => {
  it('shows the callout and its button', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Set my schedule' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Open schedule'
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate hub Dismiss schedule prompt'
    );
    expect(screen.getByText('Set your debate schedule')).toBeInTheDocument();
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

  // Onboarding only: once a schedule exists, the header's calendar button is where it lives.
  it('retires once a schedule is saved', () => {
    mocks.isSet = true;
    setup();

    expect(screen.queryByText('Set your debate schedule')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set my schedule' })).not.toBeInTheDocument();
  });

  // Defaulting to "unset" before the read answers would flash the banner at everyone who already
  // has a schedule, every time the panel opens.
  it('waits for the schedule read before showing', () => {
    mocks.loaded = false;
    setup();

    expect(screen.queryByText('Set your debate schedule')).not.toBeInTheDocument();
  });

  // Signed out the read is disabled, so the modal it opens would sit on "Loading your schedule"
  // with nothing coming.
  it('does not render signed out', () => {
    mocks.authenticated = false;
    setup();

    expect(screen.queryByText('Set your debate schedule')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set my schedule' })).not.toBeInTheDocument();
  });

  it('stays dismissed once closed', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByText('Set your debate schedule')).not.toBeInTheDocument());
  });
});

// Both ways the banner leaves take the focused control with it. Focus goes up to the header's
// calendar — the schedule's standing home — rather than dropping to the page.
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

  it('moves focus to the header calendar when dismissed', async () => {
    const { user } = setupWithHeader();
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByText('Set your debate schedule')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Header calendar' })).toHaveFocus();
  });

  it('returns focus to the header calendar after a save, which then retires the banner', async () => {
    const { user, rerender } = setupWithHeader();
    await user.click(await screen.findByRole('button', { name: 'Set my schedule' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const header = screen.getByRole('button', { name: 'Header calendar' });
    await waitFor(() => expect(header).toHaveFocus());

    // The save lands and the banner retires. Focus was never on it, so nothing is lost.
    mocks.isSet = true;
    rerender(<Harness />);
    expect(screen.queryByText('Set your debate schedule')).not.toBeInTheDocument();
    expect(header).toHaveFocus();
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
