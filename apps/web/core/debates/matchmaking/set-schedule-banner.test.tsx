import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SetScheduleBanner } from './set-schedule-banner';

// The banner now reads and writes the saved calendar (GEO-2932). These tests are about the
// callout and the modal opening, not the round trip, so the hooks are stubbed -- the payload
// conversion has its own tests in core/availability.
vi.mock('~/core/debates/hooks', () => ({
  useDebateSchedule: () => ({ blocks: [], isSet: false }),
  useSaveDebateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
}));


afterEach(() => {
  cleanup();
  // The dismissal is stored per notice id in localStorage, so a dismissal in one case would
  // otherwise hide the banner in every case after it.
  window.localStorage.clear();
});

const setup = () => ({ user: userEvent.setup(), ...render(<SetScheduleBanner />) });

describe('SetScheduleBanner', () => {
  it('shows the callout and its button', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Set my schedule' })).toBeInTheDocument();
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

  it('stays dismissed once closed', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByText('Set your debate schedule')).not.toBeInTheDocument());
  });
});
