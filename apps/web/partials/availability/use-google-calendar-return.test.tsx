import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { calendarReturn, urlWithoutCalendarReturn, useGoogleCalendarReturn } from './use-google-calendar-return';

const mocks = vi.hoisted(() => ({
  flagOn: true,
  search: '',
  setToast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/space/abc',
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => id === 'googleCalendar' && mocks.flagOn,
}));

vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));

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
});

describe('useGoogleCalendarReturn', () => {
  const replaceState = vi.spyOn(window.history, 'replaceState');

  beforeEach(() => {
    mocks.flagOn = true;
    mocks.search = '';
    mocks.setToast.mockReset();
    replaceState.mockReset();
  });

  afterEach(() => replaceState.mockReset());

  it('toasts a connection and clears the params', () => {
    mocks.search = 'tab=x&calendar=connected';
    renderHook(() => useGoogleCalendarReturn());

    expect(toastText()).toMatch(/^Google Calendar connected/);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/space/abc?tab=x');
  });

  it('says why a connection failed', () => {
    mocks.search = 'calendar=error&reason=scope_missing';
    renderHook(() => useGoogleCalendarReturn());

    expect(toastText()).toMatch(/Allow access to your free\/busy times/);
  });

  it('leaves the URL alone with the flag off', () => {
    mocks.flagOn = false;
    mocks.search = 'calendar=connected';
    renderHook(() => useGoogleCalendarReturn());

    expect(mocks.setToast).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('does nothing without the params', () => {
    renderHook(() => useGoogleCalendarReturn());
    expect(mocks.setToast).not.toHaveBeenCalled();
  });
});
