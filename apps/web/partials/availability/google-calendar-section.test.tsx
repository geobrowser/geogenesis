import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError, type GoogleCalendarConnection } from '~/core/debates/api';

import { GoogleCalendarSection } from './google-calendar-section';

type Mutation = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
};

const mutation = (): Mutation => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null });

const mocks = vi.hoisted(() => ({
  connections: {
    google: undefined as GoogleCalendarConnection | null | undefined,
    isError: false,
    disabled: false,
    refetch: () => {},
  },
  connect: null as unknown as Mutation,
  refresh: null as unknown as Mutation,
  disconnect: null as unknown as Mutation,
}));

vi.mock('~/core/debates/calendar-hooks', () => ({
  useCalendarConnections: () => mocks.connections,
  useConnectGoogleCalendar: () => mocks.connect,
  useRefreshGoogleCalendar: () => mocks.refresh,
  useDisconnectGoogleCalendar: () => mocks.disconnect,
}));

const connection = (overrides: Partial<GoogleCalendarConnection> = {}): GoogleCalendarConnection => ({
  account_email: 'ada@example.com',
  status: 'ok',
  stale: false,
  last_success_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  last_error: null,
  ...overrides,
});

beforeEach(() => {
  mocks.connections = { google: null, isError: false, disabled: false, refetch: () => {} };
  mocks.connect = mutation();
  mocks.refresh = mutation();
  mocks.disconnect = mutation();
});

afterEach(cleanup);

describe('GoogleCalendarSection', () => {
  it('draws nothing when geo-chat has the feature off', () => {
    mocks.connections.disabled = true;
    const { container } = render(<GoogleCalendarSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('connects with the current URL plus the editor trigger to come back to, then goes to Google', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: 'https://www.geobrowser.io/explore?tab=x', assign });
    render(<GoogleCalendarSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }));

    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      { returnTo: 'https://www.geobrowser.io/explore?tab=x&modal=schedule', source: 'connect' },
      expect.anything()
    );
    const { onSuccess } = mocks.connect.mutate.mock.calls[0][1];
    onSuccess({ authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    vi.unstubAllGlobals();
  });

  it('shows the account, last sync, Refresh and Disconnect when connected', async () => {
    mocks.connections.google = connection();
    render(<GoogleCalendarSection />);

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Synced 4 min ago')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mocks.refresh.mutate).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
  });

  it('offers Reconnect instead of Refresh when access is gone', async () => {
    mocks.connections.google = connection({ status: 'needs_reconnect', last_error: 'invalid_grant', stale: true });
    render(<GoogleCalendarSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(mocks.connect.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'reconnect' }),
      expect.anything()
    );
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.getByText(/no longer has access/)).toBeInTheDocument();
    // The reconnect line already says busy time has stopped; the stale line would repeat it.
    expect(screen.queryByText(/hasn’t synced recently/)).not.toBeInTheDocument();
  });

  it('warns when busy time has stopped applying', () => {
    mocks.connections.google = connection({ stale: true, last_success_at: null });
    render(<GoogleCalendarSection />);

    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
    expect(screen.getByText(/hasn’t synced recently/)).toBeInTheDocument();
  });

  it('says why a refresh was refused', () => {
    mocks.connections.google = connection();
    mocks.refresh = { ...mutation(), isError: true, error: new GeoChatRequestError('x', 'rate_limited', 429) };
    render(<GoogleCalendarSection />);

    expect(screen.getByRole('alert')).toHaveTextContent('You just refreshed. Try again in a minute.');
  });

  it('holds Connect while the grid has unsaved edits', () => {
    render(<GoogleCalendarSection unsavedChanges />);

    expect(screen.getByRole('button', { name: 'Connect Google Calendar' })).toBeDisabled();
    expect(screen.getByText('Save your hours first.')).toBeInTheDocument();
  });

  it('holds Reconnect while the grid has unsaved edits, but not Disconnect', () => {
    mocks.connections.google = connection({ status: 'needs_reconnect', last_error: 'invalid_grant' });
    render(<GoogleCalendarSection unsavedChanges />);

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
    expect(screen.getByText('Save your hours first.')).toBeInTheDocument();
  });

  it('says how connecting went when reopened on the way back', () => {
    mocks.connections.google = connection();
    render(<GoogleCalendarSection returned={{ outcome: 'connected', reason: null }} />);

    expect(screen.getByRole('status')).toHaveTextContent(/^Google Calendar connected/);
  });

  it('confirms before disconnecting', async () => {
    mocks.connections.google = connection();
    render(<GoogleCalendarSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(mocks.disconnect.mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect calendar' }));
    expect(mocks.disconnect.mutate).toHaveBeenCalled();
  });
});
