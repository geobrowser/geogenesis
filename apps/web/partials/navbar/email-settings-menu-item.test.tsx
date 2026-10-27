import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmailGroupSettings } from '~/core/notifications/email-groups';

type State = {
  registration: { isError: boolean; isSuccess: boolean; data?: { email: string | null } };
  preferences: { isError: boolean; data?: { email_enabled: boolean; email_groups?: EmailGroupSettings } };
};

const mocks = vi.hoisted(() => ({ state: null as unknown as State, spaceCalls: true }));

vi.mock('~/core/notifications/hooks', () => ({
  useNotificationPreferences: () => mocks.state,
}));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.spaceCalls }));

const { EmailSettingsMenuItem } = await import('./email-settings-menu-item');

const allOn: EmailGroupSettings = {
  invites: true,
  community_calls: true,
  your_debates: true,
  replies: true,
  digest: true,
  getting_started: true,
};

const ready = (
  emailEnabled: boolean,
  groups: EmailGroupSettings | null = allOn,
  email: string | null = 'a@b.com'
): State => ({
  registration: { isError: false, isSuccess: true, data: { email } },
  preferences: { isError: false, data: { email_enabled: emailEnabled, email_groups: groups ?? undefined } },
});

beforeEach(() => {
  mocks.state = ready(true);
  mocks.spaceCalls = true;
});
afterEach(() => cleanup());

const row = () => screen.getByRole('button', { name: /email settings/i });

describe('EmailSettingsMenuItem', () => {
  it('says how many groups are on, and opens the settings', async () => {
    mocks.state = ready(true, { ...allOn, digest: false });
    const onOpen = vi.fn();
    render(<EmailSettingsMenuItem onOpen={onOpen} />);

    expect(row()).toHaveTextContent('5 of 6 on');
    await userEvent.setup().click(row());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('counts call reminders only with Community calls on', () => {
    mocks.spaceCalls = false;
    mocks.state = ready(true, { ...allOn, digest: false });
    render(<EmailSettingsMenuItem onOpen={vi.fn()} />);
    expect(row()).toHaveTextContent('4 of 5 on');
  });

  it('says Off when every email is off, whatever the groups hold', () => {
    mocks.state = ready(false);
    render(<EmailSettingsMenuItem onOpen={() => {}} />);

    expect(row()).toHaveTextContent('Off');
    expect(row()).not.toHaveTextContent('of 6');
  });

  it('says On before the service reports groups', () => {
    mocks.state = ready(true, null);
    render(<EmailSettingsMenuItem onOpen={() => {}} />);

    expect(row()).toHaveTextContent(/On$/);
  });

  it('says it is unavailable when geo-notifications cannot be reached', () => {
    mocks.state = { registration: { isError: true, isSuccess: false }, preferences: { isError: false } };
    render(<EmailSettingsMenuItem onOpen={() => {}} />);

    expect(screen.getByText('Unavailable right now')).toBeInTheDocument();
  });

  it('explains why email settings are inert for an account with no address', () => {
    mocks.state = ready(true, allOn, null);
    render(<EmailSettingsMenuItem onOpen={() => {}} />);

    expect(screen.getByText('No email on your account')).toBeInTheDocument();
    expect(row()).not.toHaveTextContent('6 of 6 on');
  });
});
