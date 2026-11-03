import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { claimCalendarPicks, personCalendarPicks } from './debate-calendar-route';

const nav = vi.hoisted(() => ({ pathname: '/space/abc' as string | null, search: 'proposal=1&modal=debates' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const { useCalendarHref } = await import('./use-calendar-href');

const params = (href: string) => new URL(href, 'https://geo.local').searchParams;

afterEach(() => {
  nav.pathname = '/space/abc';
  nav.search = 'proposal=1&modal=debates';
});

describe('useCalendarHref', () => {
  it('comes back to this page, without the panel’s own trigger', () => {
    const { result } = renderHook(() => useCalendarHref());

    expect(params(result.current).get('from')).toBe('/space/abc?proposal=1');
  });

  // Every Schedule on a claim narrows the same way: that claim, and only the people on its other side.
  it('narrows to one claim and its matches', () => {
    const { result } = renderHook(() => useCalendarHref(claimCalendarPicks('space1', 'claim1')));

    expect(params(result.current).get('claims')).toBe('space1:claim1');
    expect(params(result.current).get('matches')).toBe('1');
  });

  it('narrows to one person', () => {
    const { result } = renderHook(() => useCalendarHref(personCalendarPicks('person1')));

    expect(params(result.current).get('people')).toBe('person1');
    expect(params(result.current).get('matches')).toBeNull();
  });

  it('carries no way back before the router knows the page', () => {
    nav.pathname = null;
    const { result } = renderHook(() => useCalendarHref());

    expect(params(result.current).get('from')).toBeNull();
  });
});
