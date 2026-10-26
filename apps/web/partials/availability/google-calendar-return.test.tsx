import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toOwnSchedule } from '~/core/availability/own-schedule-deep-link';

import { calendarReturn, calendarReturnTo, urlWithoutCalendarReturn } from './calendar-return-url';
import { GoogleCalendarReturn } from './google-calendar-return';

const mocks = vi.hoisted(() => ({
  flagOn: true,
  microsoftFlagOn: false,
  ready: true,
  authenticated: true,
  search: '',
  setToast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/space/abc',
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) =>
    (id === 'googleCalendar' && mocks.flagOn) || (id === 'microsoftCalendar' && mocks.microsoftFlagOn),
}));

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));

vi.mock('./own-schedule-modal', () => ({
  OwnScheduleModal: ({ calendarReturn: returned, surface }: { calendarReturn: unknown; surface: string }) => (
    <div role="dialog" data-surface={surface} data-returned={JSON.stringify(returned)} />
  ),
}));

const toastText = () => {
  const [element] = mocks.setToast.mock.calls[0];
  return element.props.children as string;
};

describe('calendarReturn', () => {
  it('reads only the two outcomes geo-chat sends', () => {
    expect(calendarReturn(new URLSearchParams('calendar=connected'))).toEqual({
      provider: 'google',
      outcome: 'connected',
      reason: null,
    });
    expect(calendarReturn(new URLSearchParams('calendar=error&reason=denied'))).toEqual({
      provider: 'google',
      outcome: 'error',
      reason: 'denied',
    });
    expect(calendarReturn(new URLSearchParams('calendar=other'))).toBeNull();
    expect(calendarReturn(new URLSearchParams('calendar=other&calendar_provider=microsoft'))).toBeNull();
    expect(calendarReturn(new URLSearchParams(''))).toBeNull();
  });

  it('reads the provider the web put on the return URL, Google when absent or unknown', () => {
    expect(
      calendarReturn(new URLSearchParams('calendar=error&reason=admin_consent_required&calendar_provider=microsoft'))
    ).toEqual({ provider: 'microsoft', outcome: 'error', reason: 'admin_consent_required' });
    expect(calendarReturn(new URLSearchParams('calendar=connected&calendar_provider=apple'))?.provider).toBe('google');
  });
});

describe('calendarReturnTo', () => {
  it('leaves Google’s return URL as it was', () => {
    for (const href of [
      'https://www.geobrowser.io/space/abc?q=a%20b#top',
      'https://www.geobrowser.io/',
      'http://localhost:3002/x?modal=debates',
    ]) {
      expect(calendarReturnTo('google', href)).toBe(toOwnSchedule(href));
    }
  });

  it('names Outlook, replacing a provider already on the page', () => {
    expect(calendarReturnTo('microsoft', 'https://www.geobrowser.io/space/abc?tab=x')).toBe(
      'https://www.geobrowser.io/space/abc?tab=x&modal=schedule&calendar_provider=microsoft'
    );
    expect(calendarReturnTo('google', 'https://www.geobrowser.io/?calendar_provider=microsoft')).toBe(
      'https://www.geobrowser.io/?modal=schedule'
    );
  });
});

describe('urlWithoutCalendarReturn', () => {
  it('drops calendar and reason, keeping other params and the fragment', () => {
    expect(
      urlWithoutCalendarReturn('/space/abc', new URLSearchParams('tab=x&calendar=error&reason=denied'), '#top')
    ).toBe('/space/abc?tab=x#top');
    expect(urlWithoutCalendarReturn('/space/abc', new URLSearchParams('calendar=connected'))).toBe('/space/abc');
  });

  it('drops the provider too', () => {
    expect(
      urlWithoutCalendarReturn(
        '/space/abc',
        new URLSearchParams('tab=x&calendar=connected&calendar_provider=microsoft')
      )
    ).toBe('/space/abc?tab=x');
  });

  it('drops the editor trigger too when asked', () => {
    expect(
      urlWithoutCalendarReturn('/space/abc', new URLSearchParams('tab=x&modal=schedule&calendar=connected'), '', true)
    ).toBe('/space/abc?tab=x');
  });
});

describe('GoogleCalendarReturn', () => {
  const replaceState = vi.spyOn(window.history, 'replaceState');

  beforeEach(() => {
    mocks.flagOn = true;
    mocks.microsoftFlagOn = false;
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.search = '';
    mocks.setToast.mockReset();
    replaceState.mockReset();
    capture.mockReset();
  });

  afterEach(() => {
    cleanup();
    replaceState.mockReset();
  });

  it('reopens the editor with the outcome, clearing both triggers in one write', () => {
    mocks.search = 'tab=x&modal=schedule&calendar=error&reason=denied';
    render(<GoogleCalendarReturn />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-surface', 'google_calendar');
    expect(JSON.parse(dialog.getAttribute('data-returned')!)).toEqual({
      provider: 'google',
      outcome: 'error',
      reason: 'denied',
    });
    expect(mocks.setToast).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/abc?tab=x');
  });

  it('toasts instead when signed out', () => {
    mocks.authenticated = false;
    mocks.search = 'modal=schedule&calendar=connected';
    render(<GoogleCalendarReturn />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toastText()).toMatch(/^Google Calendar connected/);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/abc');
  });

  it('toasts a return without the editor trigger, leaving any other modal alone', () => {
    mocks.search = 'modal=debates&calendar=error&reason=scope_missing';
    render(<GoogleCalendarReturn />);

    expect(toastText()).toMatch(/Allow access to your free\/busy times/);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/abc?modal=debates');
  });

  it('waits for Privy before acting', () => {
    mocks.ready = false;
    mocks.search = 'modal=schedule&calendar=connected';
    render(<GoogleCalendarReturn />);

    expect(mocks.setToast).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('leaves the URL alone with the flag off', () => {
    mocks.flagOn = false;
    mocks.search = 'modal=schedule&calendar=connected';
    render(<GoogleCalendarReturn />);

    expect(mocks.setToast).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('counts a return once, however often it re-renders', () => {
    mocks.search = 'modal=schedule&calendar=connected';
    const { rerender } = render(<GoogleCalendarReturn />);
    rerender(<GoogleCalendarReturn />);
    rerender(<GoogleCalendarReturn />);

    expect(capture.mock.calls).toEqual([['calendar_connected', { provider: 'google' }]]);
  });

  it('counts a failed return by its reason, signed out too', () => {
    mocks.authenticated = false;
    mocks.search = 'modal=schedule&calendar=error&reason=scope_missing';
    render(<GoogleCalendarReturn />);

    expect(capture.mock.calls).toEqual([
      ['calendar_connect_failed', { provider: 'google', reason: 'scope_missing', stage: 'callback' }],
    ]);
  });

  it('counts nothing for a plain editor link', () => {
    mocks.search = 'modal=schedule';
    render(<GoogleCalendarReturn />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(capture).not.toHaveBeenCalled();
  });

  it('reopens the editor from an Outlook return with only the Outlook flag on, counted as microsoft', () => {
    mocks.flagOn = false;
    mocks.microsoftFlagOn = true;
    mocks.search = 'modal=schedule&calendar=connected&calendar_provider=microsoft';
    render(<GoogleCalendarReturn />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-surface', 'microsoft_calendar');
    expect(JSON.parse(dialog.getAttribute('data-returned')!)).toEqual({
      provider: 'microsoft',
      outcome: 'connected',
      reason: null,
    });
    expect(capture.mock.calls).toEqual([['calendar_connected', { provider: 'microsoft' }]]);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/abc');
  });

  it('toasts the admin approval message when signed out', () => {
    mocks.microsoftFlagOn = true;
    mocks.authenticated = false;
    mocks.search = 'calendar=error&reason=admin_consent_required&calendar_provider=microsoft';
    render(<GoogleCalendarReturn />);

    expect(toastText()).toMatch(/^Your organization’s IT admin must approve Geo/);
    expect(capture.mock.calls).toEqual([
      ['calendar_connect_failed', { provider: 'microsoft', reason: 'admin_consent_required', stage: 'callback' }],
    ]);
  });
});
