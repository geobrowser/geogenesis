import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CalendarConnection, GeoChatRequestError } from '~/core/debates/api';

import {
  calendarConnectCallbackFailed,
  calendarConnectRequestFailed,
  calendarConnectStarted,
  calendarConnected,
  calendarDisconnected,
  calendarRefreshed,
} from './calendar-analytics';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

afterEach(() => capture.mockClear());

describe('calendar analytics', () => {
  it('names the provider and the button that started a connect', () => {
    calendarConnectStarted('google', 'reconnect');
    expect(capture).toHaveBeenCalledWith('calendar_connect_started', { provider: 'google', source: 'reconnect' });
  });

  it('reports a refused connect request by its code, at the request stage', () => {
    calendarConnectRequestFailed('google', new GeoChatRequestError('Bad return', 'invalid_return_to', 400));
    calendarConnectRequestFailed('google', new TypeError('Failed to fetch'));

    expect(capture).toHaveBeenNthCalledWith(1, 'calendar_connect_failed', {
      provider: 'google',
      reason: 'invalid_return_to',
      stage: 'request',
    });
    expect(capture).toHaveBeenNthCalledWith(2, 'calendar_connect_failed', {
      provider: 'google',
      reason: 'unknown',
      stage: 'request',
    });
  });

  it('reports a failed redirect by its reason, at the callback stage', () => {
    calendarConnectCallbackFailed('google', 'denied');
    calendarConnectCallbackFailed('google', null);

    expect(capture).toHaveBeenNthCalledWith(1, 'calendar_connect_failed', {
      provider: 'google',
      reason: 'denied',
      stage: 'callback',
    });
    expect(capture).toHaveBeenNthCalledWith(2, 'calendar_connect_failed', {
      provider: 'google',
      reason: 'unknown',
      stage: 'callback',
    });
  });

  it('names Outlook as microsoft, with its admin consent reason', () => {
    calendarConnectCallbackFailed('microsoft', 'admin_consent_required');
    calendarConnected('microsoft');

    expect(capture.mock.calls).toEqual([
      ['calendar_connect_failed', { provider: 'microsoft', reason: 'admin_consent_required', stage: 'callback' }],
      ['calendar_connected', { provider: 'microsoft' }],
    ]);
  });

  it('reports the remaining outcomes with the provider only', () => {
    calendarConnected('google');
    calendarDisconnected('google');

    expect(capture.mock.calls).toEqual([
      ['calendar_connected', { provider: 'google' }],
      ['calendar_disconnected', { provider: 'google' }],
    ]);
  });

  it('reports a refresh by how its sync went, a missing connection as an error', () => {
    const connection = (status: CalendarConnection['status']): CalendarConnection => ({
      account_email: 'ada@example.com',
      status,
      stale: false,
      last_success_at: null,
      last_error: null,
    });

    calendarRefreshed('google', connection('ok'));
    calendarRefreshed('google', connection('error'));
    calendarRefreshed('google', connection('needs_reconnect'));
    calendarRefreshed('google', null);

    expect(capture.mock.calls).toEqual([
      ['calendar_refreshed', { provider: 'google', outcome: 'ok' }],
      ['calendar_refreshed', { provider: 'google', outcome: 'error' }],
      ['calendar_refreshed', { provider: 'google', outcome: 'needs_reconnect' }],
      ['calendar_refreshed', { provider: 'google', outcome: 'error' }],
    ]);
  });
});
