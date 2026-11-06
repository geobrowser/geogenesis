import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCOUNT_SETUP_MESSAGE } from '~/core/debates/account-setup-copy';
import { type CalendarConnection, GeoChatRequestError, GeoChatSessionError } from '~/core/debates/api';

import { CalendarSection } from './calendar-section';

type Mutation = {
  mutate: ReturnType<typeof vi.fn>;
  variables?: unknown;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
};

const mutation = (): Mutation => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null });

const mocks = vi.hoisted(() => ({
  connections: {
    google: undefined as CalendarConnection | null | undefined,
    microsoft: undefined as CalendarConnection | null | undefined,
    providers: undefined as string[] | undefined,
    isError: false,
    error: null as unknown,
    disabled: false,
    refetch: () => {},
  },
  connect: null as unknown as Mutation,
  refresh: {} as Record<string, Mutation>,
  disconnect: {} as Record<string, Mutation>,
}));

vi.mock('~/core/debates/calendar-hooks', async importOriginal => ({
  isCalendarSyncing: (await importOriginal<typeof import('~/core/debates/calendar-hooks')>()).isCalendarSyncing,
  useCalendarConnections: () => mocks.connections,
  useConnectCalendar: () => mocks.connect,
  useRefreshCalendar: (provider: string) => mocks.refresh[provider],
  useDisconnectCalendar: (provider: string) => mocks.disconnect[provider],
}));

const connection = (overrides: Partial<CalendarConnection> = {}): CalendarConnection => ({
  account_email: 'ada@example.com',
  status: 'ok',
  stale: false,
  last_success_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  last_error: null,
  ...overrides,
});

/** A connected calendar's chip, which opens its menu. */
const chip = (name: 'Google Calendar' | 'Outlook Calendar') =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

const openMenu = async (name: 'Google Calendar' | 'Outlook Calendar') => {
  await userEvent.click(chip(name));
  return screen.findByRole('dialog');
};

// The menu's placement hook observes the trigger, and JSDOM has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  mocks.connections = {
    google: null,
    microsoft: null,
    providers: ['google'],
    isError: false,
    error: null,
    disabled: false,
    refetch: () => {},
  };
  mocks.connect = mutation();
  mocks.refresh = { google: mutation(), microsoft: mutation() };
  mocks.disconnect = { google: mutation(), microsoft: mutation() };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CalendarSection with Google alone', () => {
  it('draws nothing when geo-chat has the feature off', () => {
    mocks.connections.disabled = true;
    const { container } = render(<CalendarSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('connects with the current URL plus the editor trigger to come back to, then goes to Google', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: 'https://www.geobrowser.io/explore?tab=x', assign });
    render(<CalendarSection />);

    expect(screen.getByText('Geo only sees when you’re busy, never your events.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));

    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      { provider: 'google', returnTo: 'https://www.geobrowser.io/explore?tab=x&modal=schedule', source: 'connect' },
      expect.anything()
    );
    const { onSuccess } = mocks.connect.mutate.mock.calls[0][1];
    onSuccess({ authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('draws a connected calendar as one chip, with sync and disconnect in its menu', async () => {
    mocks.connections.google = connection();
    render(<CalendarSection />);

    expect(chip('Google Calendar')).toHaveTextContent('ada@example.com');
    // A healthy calendar says nothing else, and offers nothing to connect.
    expect(screen.queryByText('Synced 4 min ago')).not.toBeInTheDocument();
    expect(screen.queryByText(/never your events/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();

    const menu = await openMenu('Google Calendar');
    expect(within(menu).getByText('Synced 4 min ago')).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Sync now' }));
    expect(mocks.refresh.google.mutate).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('puts Reconnect on the chip when access is gone, with one line saying why', async () => {
    mocks.connections.google = connection({ status: 'needs_reconnect', last_error: 'invalid_grant', stale: true });
    const { container } = render(<CalendarSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', source: 'reconnect' }),
      expect.anything()
    );
    expect(container.querySelector('[data-calendar-status="needs_reconnect"]')).toHaveClass('bg-red-02');
    expect(container.querySelectorAll('[data-calendar-line]')).toHaveLength(1);
    expect(screen.getByText(/no longer has access/)).toBeInTheDocument();
    // The reconnect line already says busy time has stopped; the stale line would repeat it.
    expect(screen.queryByText(/hasn’t synced recently/)).not.toBeInTheDocument();

    // Sync does nothing while access is gone.
    const menu = await openMenu('Google Calendar');
    expect(within(menu).queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('warns in one line when busy time has stopped applying', async () => {
    mocks.connections.google = connection({
      stale: true,
      last_success_at: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
    });
    const { container } = render(<CalendarSection />);

    expect(container.querySelectorAll('[data-calendar-line]')).toHaveLength(1);
    expect(screen.getByText(/hasn’t synced recently/)).toBeInTheDocument();
    expect(within(await openMenu('Google Calendar')).getByText('Synced 3 days ago')).toBeInTheDocument();
  });

  it('reads a connection whose first sync has not landed as syncing, not stale', async () => {
    mocks.connections.google = connection({ stale: true, last_success_at: null });
    render(<CalendarSection />);

    expect(screen.queryByText(/hasn’t synced recently/)).not.toBeInTheDocument();
    const menu = await openMenu('Google Calendar');
    expect(within(menu).getByText('Syncing…')).toBeInTheDocument();
    expect(within(menu).queryByText('Not synced yet')).not.toBeInTheDocument();
  });

  it('does not offer Sync now while the first sync is running', async () => {
    mocks.connections.google = connection({ stale: true, last_success_at: null });
    render(<CalendarSection />);

    const menu = await openMenu('Google Calendar');
    expect(within(menu).queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('says a failed first sync was never synced, in one line under the chip', async () => {
    mocks.connections.google = connection({
      status: 'error',
      last_error: 'unknown',
      stale: true,
      last_success_at: null,
    });
    const { container } = render(<CalendarSection />);

    expect(container.querySelectorAll('[data-calendar-line]')).toHaveLength(1);
    const menu = await openMenu('Google Calendar');
    expect(within(menu).getByText('Not synced yet')).toBeInTheDocument();
    expect(within(menu).queryByText('Syncing…')).not.toBeInTheDocument();
  });

  it('keeps Sync now, not Reconnect, when geo-chat’s own client was refused', async () => {
    mocks.connections.google = connection({ status: 'error', last_error: 'provider_misconfigured' });
    render(<CalendarSection />);

    expect(screen.getByText('Calendar connections aren’t available right now. Try again later.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(within(await openMenu('Google Calendar')).getByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('says why a refresh was refused, in place of the connection’s own line', () => {
    mocks.connections.google = connection({ stale: true, last_success_at: '2020-01-01T00:00:00Z' });
    mocks.refresh.google = { ...mutation(), isError: true, error: new GeoChatRequestError('x', 'rate_limited', 429) };
    const { container } = render(<CalendarSection />);

    expect(screen.getByRole('alert')).toHaveTextContent('You just refreshed. Try again in a minute.');
    expect(container.querySelectorAll('[data-calendar-line]')).toHaveLength(1);
  });

  it('saves unsaved edits, then connects', async () => {
    const order: string[] = [];
    const saveDraft = vi.fn(async () => {
      order.push('save');
    });
    mocks.connect.mutate.mockImplementation(() => order.push('connect'));
    render(<CalendarSection unsavedChanges saveDraft={saveDraft} />);

    expect(screen.queryByText('Save your hours first.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));

    await waitFor(() => expect(order).toEqual(['save', 'connect']));
  });

  it('labels the pressed button while the save runs, and holds the rest', async () => {
    mocks.connections.providers = ['google', 'microsoft'];
    let finish = () => {};
    const saveDraft = () => new Promise<void>(resolve => (finish = resolve));
    render(<CalendarSection unsavedChanges saveDraft={saveDraft} />);

    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));

    expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect Outlook Calendar' })).toBeDisabled();
    expect(mocks.connect.mutate).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(mocks.connect.mutate).toHaveBeenCalled());
  });

  it('stays here, without connecting, when the save fails', async () => {
    const saveDraft = vi.fn(() => Promise.reject(new Error('down')));
    render(<CalendarSection unsavedChanges saveDraft={saveDraft} />);

    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t save your availability. Please try again.');
    expect(mocks.connect.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeEnabled();
  });

  it('saves first on Reconnect too', async () => {
    mocks.connections.google = connection({ status: 'needs_reconnect', last_error: 'invalid_grant' });
    const saveDraft = vi.fn(() => Promise.resolve());
    render(<CalendarSection unsavedChanges saveDraft={saveDraft} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(saveDraft).toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.connect.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google', source: 'reconnect' }),
        expect.anything()
      )
    );
  });

  it('connects straight away when there is nothing to save', async () => {
    const saveDraft = vi.fn(() => Promise.resolve());
    render(<CalendarSection saveDraft={saveDraft} />);

    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));

    expect(saveDraft).not.toHaveBeenCalled();
    expect(mocks.connect.mutate).toHaveBeenCalled();
  });

  it('marks the calendar just connected and says how it went, when reopened on the way back', () => {
    mocks.connections.google = connection();
    render(<CalendarSection returned={{ provider: 'google', outcome: 'connected', reason: null }} />);

    expect(within(chip('Google Calendar')).getByRole('img', { name: 'Connected' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/^Google Calendar connected/);
  });

  it('confirms before disconnecting, in the chip’s popover', async () => {
    mocks.connections.google = connection();
    render(<CalendarSection />);

    const menu = await openMenu('Google Calendar');
    await userEvent.click(within(menu).getByRole('button', { name: 'Disconnect' }));
    expect(mocks.disconnect.google.mutate).not.toHaveBeenCalled();
    expect(within(menu).getByText('Disconnect Google Calendar?')).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole('button', { name: 'Keep' }));
    expect(within(menu).getByRole('button', { name: 'Sync now' })).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole('button', { name: 'Disconnect' }));
    await userEvent.click(within(menu).getByRole('button', { name: 'Disconnect calendar' }));
    expect(mocks.disconnect.google.mutate).toHaveBeenCalled();
  });

  it('keeps focus in the menu as it switches to the confirm and back', async () => {
    mocks.connections.google = connection();
    render(<CalendarSection />);

    const menu = await openMenu('Google Calendar');
    await userEvent.click(within(menu).getByRole('button', { name: 'Disconnect' }));
    expect(within(menu).getByRole('button', { name: 'Keep' })).toHaveFocus();

    await userEvent.click(within(menu).getByRole('button', { name: 'Keep' }));
    expect(within(menu).getByRole('button', { name: 'Disconnect' })).toHaveFocus();
  });

  it('offers no second sync while one is running, and says it is syncing', async () => {
    mocks.connections.google = connection();
    mocks.refresh.google = { ...mutation(), isPending: true };
    render(<CalendarSection />);

    const menu = await openMenu('Google Calendar');
    expect(within(menu).getByText('Syncing…')).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('says why a disconnect was refused, in the popover', async () => {
    mocks.connections.google = connection();
    mocks.disconnect.google = { ...mutation(), isError: true, error: new Error('x') };
    render(<CalendarSection />);

    const menu = await openMenu('Google Calendar');
    await userEvent.click(within(menu).getByRole('button', { name: 'Disconnect' }));
    expect(within(menu).getByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });
});

describe('CalendarSection with Outlook', () => {
  it('offers both, in geo-chat order, in one row', () => {
    mocks.connections.providers = ['microsoft', 'google'];
    render(<CalendarSection />);

    expect(screen.getByRole('region', { name: 'Calendars' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Connect Outlook Calendar',
      'Connect Google Calendar',
    ]);
  });

  it('offers only what geo-chat has configured', () => {
    mocks.connections.providers = ['google'];
    render(<CalendarSection />);

    expect(screen.getByRole('region', { name: 'Google Calendar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Outlook Calendar' })).not.toBeInTheDocument();
  });

  it('draws nothing when geo-chat has no calendar configured', () => {
    mocks.connections.providers = [];
    const { container } = render(<CalendarSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('connects Outlook with the provider in the return URL, then goes to Microsoft', async () => {
    mocks.connections.providers = ['google', 'microsoft'];
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: 'https://www.geobrowser.io/explore?tab=x', assign });
    render(<CalendarSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Connect Outlook Calendar' }));

    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      {
        provider: 'microsoft',
        returnTo: 'https://www.geobrowser.io/explore?tab=x&modal=schedule&calendar_provider=microsoft',
        source: 'connect',
      },
      expect.anything()
    );
    const { onSuccess } = mocks.connect.mutate.mock.calls[0][1];
    onSuccess({ authorization_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1' });
    expect(assign).toHaveBeenCalledWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1');
  });

  it('labels only the pressed button while the browser leaves', () => {
    mocks.connections.providers = ['google', 'microsoft'];
    mocks.connect = { ...mutation(), isPending: true, variables: { provider: 'microsoft' } } as Mutation;
    render(<CalendarSection />);

    expect(screen.getByRole('button', { name: 'Opening Microsoft…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeDisabled();
  });

  it('says why a connect was refused under the row, for that calendar', () => {
    mocks.connections.providers = ['google', 'microsoft'];
    mocks.connect = {
      ...mutation(),
      isError: true,
      error: new Error('x'),
      variables: { provider: 'microsoft' },
    } as Mutation;
    const { container } = render(<CalendarSection />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(container.querySelector('[data-calendar-line="microsoft"]')).toBeInTheDocument();
  });

  it('shows both connected chips, each syncing its own provider', async () => {
    mocks.connections.providers = ['google', 'microsoft'];
    mocks.connections.google = connection();
    mocks.connections.microsoft = connection({ account_email: 'ada@contoso.com' });
    render(<CalendarSection />);

    expect(chip('Outlook Calendar')).toHaveTextContent('ada@contoso.com');
    const menu = await openMenu('Outlook Calendar');
    await userEvent.click(within(menu).getByRole('button', { name: 'Sync now' }));
    expect(mocks.refresh.microsoft.mutate).toHaveBeenCalled();
    expect(mocks.refresh.google.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Connect/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/never your events/)).not.toBeInTheDocument();
  });

  it('keeps Connect Google beside a connected Outlook', () => {
    mocks.connections.providers = ['google', 'microsoft'];
    mocks.connections.microsoft = connection();
    render(<CalendarSection />);

    expect(chip('Outlook Calendar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeInTheDocument();
    expect(screen.getByText('Geo only sees when you’re busy, never your events.')).toBeInTheDocument();
  });

  it('asks for another account when the mailbox cannot be read', async () => {
    mocks.connections.providers = ['microsoft'];
    mocks.connections.microsoft = connection({ status: 'needs_reconnect', last_error: 'mailbox_unavailable' });
    render(<CalendarSection />);

    expect(screen.getByText(/Connect a different Microsoft account/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use another account' }));
    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'microsoft', source: 'reconnect' }),
      expect.anything()
    );
  });

  it('says where to remove Geo from the Microsoft account when disconnecting', async () => {
    mocks.connections.providers = ['microsoft'];
    mocks.connections.microsoft = connection();
    render(<CalendarSection />);

    const menu = await openMenu('Outlook Calendar');
    await userEvent.click(within(menu).getByRole('button', { name: 'Disconnect' }));
    expect(within(menu).getByRole('link', { name: 'your app permissions' })).toHaveAttribute(
      'href',
      'https://account.live.com/consent/Manage'
    );
    expect(within(menu).getByRole('link', { name: 'My Apps' })).toHaveAttribute('href', 'https://myapps.microsoft.com');
    await userEvent.click(within(menu).getByRole('button', { name: 'Disconnect calendar' }));
    expect(mocks.disconnect.microsoft.mutate).toHaveBeenCalled();
  });

  it('says connections are unavailable when the provider refused geo-chat’s client', () => {
    mocks.connections.providers = ['microsoft'];
    render(
      <CalendarSection returned={{ provider: 'microsoft', outcome: 'error', reason: 'provider_misconfigured' }} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Calendar connections aren’t available right now. Try again later.'
    );
  });

  it('shows a failed return in place of the connection’s own problem, as its one line', () => {
    mocks.connections.google = connection({ status: 'needs_reconnect', last_error: 'invalid_grant' });
    const { container } = render(
      <CalendarSection returned={{ provider: 'google', outcome: 'error', reason: 'denied' }} />
    );

    const lines = container.querySelectorAll('[data-calendar-line]');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent('Google Calendar wasn’t connected.');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('explains the admin approval a work account needs', () => {
    mocks.connections.providers = ['microsoft'];
    render(
      <CalendarSection returned={{ provider: 'microsoft', outcome: 'error', reason: 'admin_consent_required' }} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Your organization’s IT admin must approve Geo before you can connect this calendar. Personal Microsoft accounts work without approval.'
    );
  });
});

describe('CalendarSection when the calendar can’t be read', () => {
  const refused = () => new GeoChatSessionError(new GeoChatRequestError('Unauthorized', 'no_personal_space', 401));

  it('offers Try again for a failed read', async () => {
    const refetch = vi.fn();
    mocks.connections = {
      ...mocks.connections,
      google: undefined,
      providers: undefined,
      isError: true,
      error: new GeoChatRequestError('Bad gateway', null, 502),
      refetch,
    };
    render(<CalendarSection />);

    expect(screen.getByText('We couldn’t load your calendar.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  // The editor already says "Setting up your account" for the same refusal, and it clears by itself.
  it('draws nothing while geo-chat is still setting the account up', () => {
    mocks.connections = {
      ...mocks.connections,
      google: undefined,
      providers: undefined,
      isError: true,
      error: refused(),
    };
    const { container } = render(<CalendarSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says the account is being set up when a sync is refused for it', () => {
    mocks.connections.google = connection();
    mocks.refresh.google = { ...mutation(), isError: true, error: refused() };
    render(<CalendarSection />);

    expect(screen.getByRole('alert')).toHaveTextContent(ACCOUNT_SETUP_MESSAGE);
  });
});
