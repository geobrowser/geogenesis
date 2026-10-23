import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: '',
  get: vi.fn(),
  change: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('~/core/analytics', () => ({ capture: (...args: unknown[]) => mocks.capture(...args) }));
vi.mock('~/core/notifications/api', () => ({
  geoNotificationsApiUrl: () => 'https://n.example',
  getUnsubscribeState: (...args: unknown[]) => mocks.get(...args),
  changeSubscription: (...args: unknown[]) => mocks.change(...args),
}));

const { UnsubscribePage } = await import('./unsubscribe-page');

const answer = (state: string, extra: Record<string, unknown> = {}) => ({
  state,
  group: 'digest',
  group_name: 'Weekly digest',
  email: 'jo•••@gmail.com',
  subscribed: state === 'ask' || state === 'undone',
  all_email_enabled: true,
  ...extra,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UnsubscribePage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.search = 'token=t1&kind=digest&send=s1';
  mocks.get = vi.fn(async () => answer('ask'));
  mocks.change = vi.fn(async (_b: string, _l: unknown, action: string) =>
    answer(action === 'undo' ? 'undone' : 'done')
  );
  mocks.capture = vi.fn();
});
afterEach(() => cleanup());

describe('UnsubscribePage', () => {
  it('asks first, changing nothing on open', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Unsubscribe from the weekly digest?' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'jo•••@gmail.com will stop getting the Sunday digest. Debate invites, reminders and replies to your comments keep coming.'
      )
    ).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('https://n.example', { token: 't1', kind: 'digest', send: 's1' });
    expect(mocks.change).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Email settings' })).toHaveAttribute(
      'href',
      '/explore?modal=email-settings'
    );
  });

  it('unsubscribes on the button, confirms, and undoes', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(
      await screen.findByRole('heading', { name: "You're unsubscribed from the weekly digest" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "jo•••@gmail.com won't get it anymore. You'll still get debate invites, reminders and replies to your comments."
      )
    ).toBeInTheDocument();
    expect(mocks.change).toHaveBeenLastCalledWith(
      'https://n.example',
      { token: 't1', kind: 'digest', send: 's1' },
      'unsubscribe'
    );
    expect(mocks.capture).toHaveBeenLastCalledWith('email_preference_changed', {
      group: 'digest',
      enabled: false,
      surface: 'unsubscribe_page',
    });

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('heading', { name: 'The weekly digest is back on' })).toBeInTheDocument();
    expect(screen.getByText('Your next one arrives Sunday evening.')).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenLastCalledWith('email_preference_changed', {
      group: 'digest',
      enabled: true,
      surface: 'unsubscribe_page',
      undo: true,
    });
  });

  // geo-notifications answers `already_on` to an Undo that changed nothing: the group was switched
  // back on elsewhere (settings in another tab) or Undo was pressed twice.
  it('reads as back on when Undo finds the group already on, without counting a change', async () => {
    const user = userEvent.setup();
    mocks.change = vi.fn(async (_b: string, _l: unknown, action: string) =>
      answer(action === 'undo' ? 'already_on' : 'done')
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('heading', { name: 'The weekly digest is back on' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Email settings' })).toBeInTheDocument();
    // Only the unsubscribe was a change.
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenLastCalledWith('email_preference_changed', {
      group: 'digest',
      enabled: false,
      surface: 'unsubscribe_page',
    });
  });

  it("never goes blank on a state it doesn't know yet", async () => {
    mocks.get = vi.fn(async () => answer('some_new_state'));
    renderPage();

    expect(await screen.findByRole('link', { name: 'Email settings' })).toBeInTheDocument();
  });

  it("says Undo can't be done from here once it has expired", async () => {
    const user = userEvent.setup();
    mocks.change = vi.fn(async (_b: string, _l: unknown, action: string) =>
      answer(action === 'undo' ? 'undo_expired' : 'done')
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText("This can't be undone from here anymore. You can turn it back on in your email settings.")
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('says a failed press failed, and stays on the question', async () => {
    const user = userEvent.setup();
    mocks.change = vi.fn(async () => {
      throw new Error('500');
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unsubscribe from the weekly digest?' })).toBeInTheDocument();
  });

  it('offers no Undo for a group that was already off', async () => {
    mocks.get = vi.fn(async () => answer('already_off', { group: 'invites' }));
    renderPage();

    expect(
      await screen.findByRole('heading', { name: "You're unsubscribed from debate invites and reminders" })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it("doesn't call a good link broken when the service is down, and offers to try again", async () => {
    const user = userEvent.setup();
    let down = true;
    mocks.get = vi.fn(async () => {
      if (down) throw Object.assign(new Error('geo-notifications 503'), { status: 503 });
      return answer('ask');
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: "We couldn't open this link" }, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "This unsubscribe link doesn't work" })).toBeNull();

    down = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Unsubscribe from the weekly digest?' })).toBeInTheDocument();
  });

  it('treats a dropped connection like an outage, not a bad link', async () => {
    mocks.get = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: "We couldn't open this link" }, { timeout: 3000 })
    ).toBeInTheDocument();
  });

  it('explains a link without a token, or one the service refuses', async () => {
    mocks.search = '';
    renderPage();
    expect(screen.getByRole('heading', { name: "This unsubscribe link doesn't work" })).toBeInTheDocument();
    cleanup();

    mocks.search = 'token=bad';
    mocks.get = vi.fn(async () => {
      throw Object.assign(new Error('invalid unsubscribe link'), { status: 400 });
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: "This unsubscribe link doesn't work" })).toBeInTheDocument();
  });
});
