import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type State = {
  registration: { isError: boolean; isSuccess: boolean; data?: { email: string | null } };
  preferences: { isError: boolean; data?: { email_enabled: boolean } };
};

const mocks = vi.hoisted(() => ({
  state: null as unknown as State,
  mutate: vi.fn(),
  saving: { isPending: false, isError: false },
}));

vi.mock('~/core/notifications/hooks', () => ({
  useNotificationPreferences: () => mocks.state,
  useSetEmailNotifications: () => ({ mutate: mocks.mutate, ...mocks.saving }),
}));

const { EmailNotificationsMenuItem } = await import('./email-notifications-menu-item');

const ready = (emailEnabled: boolean, email: string | null = 'a@b.com'): State => ({
  registration: { isError: false, isSuccess: true, data: { email } },
  preferences: { isError: false, data: { email_enabled: emailEnabled } },
});

beforeEach(() => {
  mocks.state = ready(true);
  mocks.mutate = vi.fn();
  mocks.saving = { isPending: false, isError: false };
});
afterEach(() => cleanup());

const toggle = () => screen.getByRole('switch', { name: /email notifications/i });

describe('EmailNotificationsMenuItem', () => {
  it("shows the server's state and flips it", async () => {
    render(<EmailNotificationsMenuItem />);

    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await userEvent.setup().click(toggle());
    expect(mocks.mutate).toHaveBeenCalledWith(false);
  });

  it('turns email back on from off', async () => {
    mocks.state = ready(false);
    render(<EmailNotificationsMenuItem />);

    await userEvent.setup().click(toggle());
    expect(mocks.mutate).toHaveBeenCalledWith(true);
  });

  it('says it is unavailable when geo-notifications cannot be reached, and cannot be pressed', () => {
    mocks.state = { registration: { isError: true, isSuccess: false }, preferences: { isError: false } };
    render(<EmailNotificationsMenuItem />);

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Unavailable right now')).toBeInTheDocument();
  });

  it('explains why email is inert for an account with no address', () => {
    mocks.state = ready(true, null);
    render(<EmailNotificationsMenuItem />);

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('No email on your account')).toBeInTheDocument();
  });

  it('says so when a save fails', () => {
    mocks.saving = { isPending: false, isError: true };
    render(<EmailNotificationsMenuItem />);

    expect(screen.getByText("Couldn't save. Try again.")).toBeInTheDocument();
  });

  it('holds still while loading', () => {
    mocks.state = { registration: { isError: false, isSuccess: false }, preferences: { isError: false } };
    render(<EmailNotificationsMenuItem />);

    expect(toggle()).toBeDisabled();
    expect(toggle()).toHaveAttribute('aria-busy', 'true');
  });
});
