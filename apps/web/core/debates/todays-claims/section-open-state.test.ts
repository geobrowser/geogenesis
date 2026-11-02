import { act, renderHook } from '@testing-library/react';

import { createElement } from 'react';

import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTodaysSectionsOpen } from './section-open-state';

/** A fresh store per mount, the way a reload starts over from what is stored. */
function mount(day: string) {
  const store = createStore();
  return renderHook(({ day: current }) => useTodaysSectionsOpen(current), {
    initialProps: { day },
    wrapper: ({ children }) => createElement(Provider, { store }, children),
  });
}

describe('useTodaysSectionsOpen', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts each section at its default', () => {
    const { result } = mount('2026-10-28');
    expect(result.current.isOpen('todays:a', true)).toBe(true);
    expect(result.current.isOpen('earlier-this-week', false)).toBe(false);
  });

  it('remembers a choice for the day, across mounts', () => {
    const first = mount('2026-10-28');
    act(() => first.result.current.setOpen('todays:a', false));
    expect(first.result.current.isOpen('todays:a', true)).toBe(false);
    first.unmount();

    const again = mount('2026-10-28');
    expect(again.result.current.isOpen('todays:a', true)).toBe(false);
  });

  it('forgets every choice when the next day’s agenda arrives', () => {
    const { result, rerender } = mount('2026-10-28');
    act(() => result.current.setOpen('earlier-this-week', true));

    rerender({ day: '2026-10-29' });

    expect(result.current.isOpen('earlier-this-week', false)).toBe(false);
  });

  it('starts over when what is stored is unreadable', () => {
    window.localStorage.setItem('todaysClaimsSections', '{not json');
    const { result } = mount('2026-10-28');
    expect(result.current.isOpen('todays:a', true)).toBe(true);
    act(() => result.current.setOpen('todays:a', false));
    expect(result.current.isOpen('todays:a', true)).toBe(false);
  });
});
