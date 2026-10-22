import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CalendarConnection, GeoChatRequestError } from '~/core/debates/api';

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
    disabled: false,
    refetch: () => {},
  },
  connect: null as unknown as Mutation,
  refresh: {} as Record<string, Mutation>,
  disconnect: {} as Record<string, Mutation>,
}));

vi.mock('~/core/debates/calendar-hooks', () => ({
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

beforeEach(() => {
  mocks.connections = {
    google: null,
    microsoft: null,
    providers: ['google', 'microsoft'],
    isError: false,
    disabled: false,
    refetch: () => {},
  };
  mocks.connect = mutation();
  mocks.refresh = { google: mutation(), microsoft: mutation() };
  mocks.disconnect = { google: mutation(), microsoft: mutation() };
});

afterEach(cleanup);

describe('CalendarSection with Google alone', () => {
  it('draws nothing when geo-chat has the feature off', () => {
    mocks.connections.disabled = true;
    const { container } = render(<CalendarSection providers={['google']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('connects with the current URL plus the editor trigger to come back to, then goes to Google', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: 'https://www.geobrowser.io/explore?tab=x', assign });
    render(<CalendarSection providers={['google']} />);

    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));

    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      { provider: 'google', returnTo: 'https://www.geobrowser.io/explore?tab=x&modal=schedule', source: 'connect' },
      expect.anything()
    );
    const { onSuccess } = mocks.connect.mutate.mock.calls[0][1];
    onSuccess({ authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    vi.unstubAllGlobals();
  });

  it('shows the account, last sync, Refresh and Disconnect when connected', async () => {
    mocks.connections.google = connection();
    render(<CalendarSection providers={['google']} />);

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Synced 4 min ago')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mocks.refresh.google.mutate).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
  });

  it('offers Reconnect instead of Refresh when access is gone', async () => {
    mocks.connections.google = connection({ status: 'needs_reconnect', last_error: 'invalid_grant', stale: true });
    render(<CalendarSection providers={['google']} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', source: 'reconnect' }),
      expect.anything()
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.getByText(/no longer has access/)).toBeInTheDocument();
    // The reconnect line already says busy time has stopped; the stale line would repeat it.
    expect(screen.queryByText(/hasn’t synced recently/)).not.toBeInTheDocument();
  });

  it('warns when busy time has stopped applying', () => {
    mocks.connections.google = connection({ stale: true, last_success_at: null });
    render(<CalendarSection providers={['google']} />);

    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
    expect(screen.getByText(/hasn’t synced recently/)).toBeInTheDocument();
  });

  it('says why a refresh was refused', () => {
    mocks.connections.google = connection();
    mocks.refresh.google = { ...mutation(), isError: true, error: new GeoChatRequestError('x', 'rate_limited', 429) };
    render(<CalendarSection providers={['google']} />);

    expect(screen.getByRole('alert')).toHaveTextContent('You just refreshed. Try again in a minute.');
  });

  it('holds Connect while the grid has unsaved edits', () => {
    render(<CalendarSection providers={['google']} unsavedChanges />);

    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeDisabled();
    expect(screen.getByText('Save your hours first.')).toBeInTheDocument();
  });

  it('holds Reconnect while the grid has unsaved edits, but not Disconnect', () => {
    mocks.connections.google = connection({ status: 'needs_reconnect', last_error: 'invalid_grant' });
    render(<CalendarSection providers={['google']} unsavedChanges />);

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
    expect(screen.getByText('Save your hours first.')).toBeInTheDocument();
  });

  it('says how connecting went when reopened on the way back', () => {
    mocks.connections.google = connection();
    render(
      <CalendarSection providers={['google']} returned={{ provider: 'google', outcome: 'connected', reason: null }} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/^Google Calendar connected/);
  });

  it('confirms before disconnecting', async () => {
    mocks.connections.google = connection();
    render(<CalendarSection providers={['google']} />);

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(mocks.disconnect.google.mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect calendar' }));
    expect(mocks.disconnect.google.mutate).toHaveBeenCalled();
  });
});

describe('CalendarSection with Outlook', () => {
  it('offers both, in geo-chat order, in one card', () => {
    mocks.connections.providers = ['microsoft', 'google'];
    render(<CalendarSection providers={['google', 'microsoft']} />);

    expect(screen.getByRole('region', { name: 'Calendars' })).toBeInTheDocument();
    expect(screen.getByText(/busy on your calendar\./)).toBeInTheDocument();
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Connect Outlook Calendar',
      'Connect Google Calendar',
    ]);
  });

  it('offers only what geo-chat has configured', () => {
    mocks.connections.providers = ['google'];
    render(<CalendarSection providers={['google', 'microsoft']} />);

    expect(screen.getByRole('region', { name: 'Google Calendar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Outlook Calendar' })).not.toBeInTheDocument();
  });

  it('draws nothing when no flagged provider is configured', () => {
    mocks.connections.providers = ['google'];
    const { container } = render(<CalendarSection providers={['microsoft']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('connects Outlook with the provider in the return URL, then goes to Microsoft', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: 'https://www.geobrowser.io/explore?tab=x', assign });
    render(<CalendarSection providers={['google', 'microsoft']} />);

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
    vi.unstubAllGlobals();
  });

  it('labels only the pressed button while the browser leaves', () => {
    mocks.connect = { ...mutation(), isPending: true, variables: { provider: 'microsoft' } } as Mutation;
    render(<CalendarSection providers={['google', 'microsoft']} />);

    expect(screen.getByRole('button', { name: 'Opening Microsoft…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeDisabled();
  });

  it('shows both connected rows, each refreshing its own provider', async () => {
    mocks.connections.google = connection();
    mocks.connections.microsoft = connection({ account_email: 'ada@contoso.com' });
    render(<CalendarSection providers={['google', 'microsoft']} />);

    const outlook = screen.getByText('Outlook Calendar').closest('[data-calendar-provider]') as HTMLElement;
    expect(within(outlook).getByText('ada@contoso.com')).toBeInTheDocument();
    await userEvent.click(within(outlook).getByRole('button', { name: 'Refresh' }));
    expect(mocks.refresh.microsoft.mutate).toHaveBeenCalled();
    expect(mocks.refresh.google.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Connect/ })).not.toBeInTheDocument();
  });

  it('keeps Connect Google beside a connected Outlook', () => {
    mocks.connections.microsoft = connection();
    render(<CalendarSection providers={['google', 'microsoft']} />);

    expect(screen.getByText('Outlook Calendar')).toBeInTheDocument();
    expect(screen.getByText(/busy on Google Calendar\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeInTheDocument();
  });

  it('asks for another account when the mailbox cannot be read', async () => {
    mocks.connections.microsoft = connection({ status: 'needs_reconnect', last_error: 'mailbox_unavailable' });
    render(<CalendarSection providers={['microsoft']} />);

    expect(screen.getByText(/Connect a different Microsoft account/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use another account' }));
    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'microsoft', source: 'reconnect' }),
      expect.anything()
    );
  });

  it('says where to remove Geo from the Microsoft account when disconnecting', async () => {
    mocks.connections.microsoft = connection();
    render(<CalendarSection providers={['microsoft']} />);

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(screen.getByRole('link', { name: 'your app permissions' })).toHaveAttribute(
      'href',
      'https://account.live.com/consent/Manage'
    );
    expect(screen.getByRole('link', { name: 'My Apps' })).toHaveAttribute('href', 'https://myapps.microsoft.com');
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect calendar' }));
    expect(mocks.disconnect.microsoft.mutate).toHaveBeenCalled();
  });

  it('explains the admin approval a work account needs', () => {
    render(
      <CalendarSection
        providers={['microsoft']}
        returned={{ provider: 'microsoft', outcome: 'error', reason: 'admin_consent_required' }}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Your organization’s IT admin must approve Geo before you can connect this calendar. Personal Microsoft accounts work without approval.'
    );
  });
});
