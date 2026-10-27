import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmailGroupSettings } from '~/core/notifications/email-groups';

const mocks = vi.hoisted(() => ({
  state: null as unknown as {
    registration: { isError: boolean; isSuccess: boolean; data?: { email: string | null } };
    preferences: {
      isError: boolean;
      data?: { email_enabled: boolean; email_groups?: EmailGroupSettings; email?: string | null };
    };
  },
  save: vi.fn(),
  status: 'idle' as 'idle' | 'saved' | 'failed',
  capture: vi.fn(),
}));

vi.mock('~/core/notifications/hooks', () => ({
  useNotificationPreferences: () => mocks.state,
  useSaveEmailSwitch: () => ({ save: mocks.save, status: mocks.status }),
}));
vi.mock('~/core/analytics', () => ({ capture: (...args: unknown[]) => mocks.capture(...args) }));

const { EmailSettingsDialog } = await import('./email-settings-dialog');

const allOn: EmailGroupSettings = {
  invites: true,
  your_debates: true,
  replies: true,
  digest: true,
  getting_started: true,
};

function ready(emailEnabled = true, groups: EmailGroupSettings | null = allOn) {
  mocks.state = {
    registration: { isError: false, isSuccess: true, data: { email: 'jordan@gmail.com' } },
    preferences: {
      isError: false,
      data: { email_enabled: emailEnabled, email_groups: groups ?? undefined, email: 'jo•••@gmail.com' },
    },
  };
}

beforeEach(() => {
  ready();
  mocks.save = vi.fn();
  mocks.status = 'idle';
  mocks.capture = vi.fn();
});
afterEach(() => cleanup());

const toggle = (name: string) => screen.getByRole('switch', { name });

describe('EmailSettingsDialog', () => {
  it('shows where email goes, the all-email switch and the five groups, and records the open', () => {
    render(<EmailSettingsDialog entry="account_menu" onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Email settings' })).toBeInTheDocument();
    expect(screen.getByText(/Sending to jo•••@gmail\.com\./)).toBeInTheDocument();
    expect(toggle('All Geo emails')).toHaveAttribute('aria-checked', 'true');
    for (const name of [
      'Debate invites and reminders',
      'Your debates',
      'Replies',
      'Weekly digest',
      'Getting started',
    ]) {
      expect(toggle(name)).toHaveAttribute('aria-checked', 'true');
    }
    expect(screen.getByText(/Space proposals are set in each space's settings\./)).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith('email_settings_opened', { entry: 'account_menu' });
  });

  it('saves a group as it changes, and says how saving went', async () => {
    const { rerender } = render(<EmailSettingsDialog entry="link" via="email" onClose={() => {}} />);
    expect(mocks.capture).toHaveBeenCalledWith('email_settings_opened', { entry: 'link', via: 'email' });
    expect(screen.getByText(/Changes save as you go\./)).toBeInTheDocument();

    await userEvent.setup().click(toggle('Weekly digest'));
    expect(mocks.save).toHaveBeenCalledWith({ group: 'digest', enabled: false });

    mocks.status = 'saved';
    rerender(<EmailSettingsDialog entry="link" via="email" onClose={() => {}} />);
    expect(screen.getByText(/^Saved\./)).toBeInTheDocument();

    mocks.status = 'failed';
    rerender(<EmailSettingsDialog entry="link" via="email" onClose={() => {}} />);
    expect(screen.getByText(/Couldn't save\. Try again\./)).toBeInTheDocument();
  });

  it('dims the groups and holds them while all email is off, keeping their values underneath', async () => {
    ready(false, { ...allOn, digest: false });
    render(<EmailSettingsDialog entry="account_menu" onClose={() => {}} />);

    expect(toggle('All Geo emails')).toHaveAttribute('aria-checked', 'false');
    expect(toggle('Replies')).toBeDisabled();
    expect(toggle('Replies')).toHaveAttribute('aria-checked', 'false');

    await userEvent.setup().click(toggle('All Geo emails'));
    expect(mocks.save).toHaveBeenCalledWith({ group: 'all', enabled: true });
  });

  it('warns while debate invites are off', () => {
    ready(true, { ...allOn, invites: false });
    render(<EmailSettingsDialog entry="account_menu" onClose={() => {}} />);

    expect(screen.getByText(/People who book a time with you won't reach you by email\./)).toBeInTheDocument();
  });

  it('shows only the all-email switch while the service reports no groups', () => {
    ready(true, null);
    render(<EmailSettingsDialog entry="account_menu" onClose={() => {}} />);

    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('explains why nothing can be set for an account with no address', () => {
    mocks.state = {
      registration: { isError: false, isSuccess: true, data: { email: null } },
      preferences: { isError: false, data: { email_enabled: true, email_groups: allOn, email: null } },
    };
    render(<EmailSettingsDialog entry="account_menu" onClose={() => {}} />);

    expect(screen.getByText('No email on your account.')).toBeInTheDocument();
    expect(toggle('All Geo emails')).toBeDisabled();
  });

  it('keeps Tab inside the dialog, and gives focus back to the opener on close', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button');
    document.body.append(opener);
    const { unmount } = render(
      <EmailSettingsDialog entry="account_menu" onClose={() => {}} openerRef={{ current: opener }} />
    );

    // jsdom has no layout, so the trap finds nothing it counts as visible and holds focus on the card;
    // what matters here is that focus starts inside the dialog and Tab can't leave it.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    screen.getByRole('button', { name: 'Done' }).focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(opener).not.toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('closes on Done and on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EmailSettingsDialog entry="account_menu" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
