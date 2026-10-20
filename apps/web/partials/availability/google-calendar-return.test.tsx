import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleCalendarReturn } from './google-calendar-return';
import { calendarReturn, urlWithoutCalendarReturn } from './google-calendar-return-url';

const mocks = vi.hoisted(() => ({
  flagOn: true,
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
  useFeatureFlag: (id: string) => id === 'googleCalendar' && mocks.flagOn,
}));

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
    expect(calendarReturn(new URLSearchParams('calendar=connected'))).toEqual({ outcome: 'connected', reason: null });
    expect(calendarReturn(new URLSearchParams('calendar=error&reason=denied'))).toEqual({
      outcome: 'error',
      reason: 'denied',
    });
    expect(calendarReturn(new URLSearchParams('calendar=other'))).toBeNull();
    expect(calendarReturn(new URLSearchParams(''))).toBeNull();
  });
});

describe('urlWithoutCalendarReturn', () => {
  it('drops calendar and reason, keeping other params and the fragment', () => {
    expect(
      urlWithoutCalendarReturn('/space/abc', new URLSearchParams('tab=x&calendar=error&reason=denied'), '#top')
    ).toBe('/space/abc?tab=x#top');
    expect(urlWithoutCalendarReturn('/space/abc', new URLSearchParams('calendar=connected'))).toBe('/space/abc');
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
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.search = '';
    mocks.setToast.mockReset();
    replaceState.mockReset();
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
    expect(JSON.parse(dialog.getAttribute('data-returned')!)).toEqual({ outcome: 'error', reason: 'denied' });
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
});
