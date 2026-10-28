import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it } from 'vitest';

import { TODAYS_CLAIMS_SECTIONS_STORAGE_KEY, useTodaysSectionsOpen } from './section-open-state';

describe('useTodaysSectionsOpen', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts each section at its default', () => {
    const { result } = renderHook(() => useTodaysSectionsOpen('2026-10-28'));
    expect(result.current.isOpen('todays:a', true)).toBe(true);
    expect(result.current.isOpen('earlier-this-week', false)).toBe(false);
  });

  it('remembers a choice for the day, across mounts', () => {
    const first = renderHook(() => useTodaysSectionsOpen('2026-10-28'));
    act(() => first.result.current.setOpen('todays:a', false));
    expect(first.result.current.isOpen('todays:a', true)).toBe(false);
    first.unmount();

    const again = renderHook(() => useTodaysSectionsOpen('2026-10-28'));
    expect(again.result.current.isOpen('todays:a', true)).toBe(false);
  });

  it('forgets every choice when the next day’s agenda arrives', () => {
    const { result, rerender } = renderHook(({ day }) => useTodaysSectionsOpen(day), {
      initialProps: { day: '2026-10-28' },
    });
    act(() => result.current.setOpen('earlier-this-week', true));

    rerender({ day: '2026-10-29' });

    expect(result.current.isOpen('earlier-this-week', false)).toBe(false);
  });

  it('holds a choice for the visit when storage is unreadable', () => {
    window.localStorage.setItem(TODAYS_CLAIMS_SECTIONS_STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useTodaysSectionsOpen('2026-10-28'));
    expect(result.current.isOpen('todays:a', true)).toBe(true);
    act(() => result.current.setOpen('todays:a', false));
    expect(result.current.isOpen('todays:a', true)).toBe(false);
  });
});
