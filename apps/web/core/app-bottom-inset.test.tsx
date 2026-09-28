import '@testing-library/jest-dom/vitest';
import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BOTTOM_INSET_MAX_HEIGHT_CLASS,
  BOTTOM_INSET_OFFSET_CLASS,
  BOTTOM_INSET_OFFSET_EXPRESSION,
  readAppBottomInset,
  subscribeAppBottomInset,
  useAppBottomInset,
} from './app-bottom-inset';

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--app-bottom-inset');
});

const inset = () => document.documentElement.style.getPropertyValue('--app-bottom-inset');

describe('useAppBottomInset', () => {
  it('publishes the footprint while active and clears it on unmount', () => {
    const view = renderHook(() => useAppBottomInset('flow-bar', 96, true));

    expect(inset()).toBe('96px');
    expect(readAppBottomInset()).toBe(96);

    view.unmount();
    expect(inset()).toBe('');
    expect(readAppBottomInset()).toBe(0);
  });

  it('publishes nothing while inactive', () => {
    renderHook(() => useAppBottomInset('flow-bar', 96, false));

    expect(inset()).toBe('');
  });

  it('follows a bar that appears and goes again', () => {
    const view = renderHook(({ active }) => useAppBottomInset('upload-banner', 28, active), {
      initialProps: { active: false },
    });
    expect(inset()).toBe('');

    view.rerender({ active: true });
    expect(inset()).toBe('28px');

    view.rerender({ active: false });
    expect(inset()).toBe('');
  });

  // Two bars can be up at once — the flow bar over a space with unsaved edits while a debate
  // recording uploads. A single `setProperty` let the second one overwrite the first.
  it('gives the bottom to the tallest of several bars', () => {
    renderHook(() => useAppBottomInset('upload-banner', 28, true));
    renderHook(() => useAppBottomInset('flow-bar', 96, true));

    expect(inset()).toBe('96px');
  });

  // The other half of it: clearing the taller bar has to uncover the shorter one rather than
  // remove the property, which would drop the assistant back on top of the banner.
  it('uncovers the next tallest when the tallest bar leaves', () => {
    renderHook(() => useAppBottomInset('upload-banner', 28, true));
    const flowBar = renderHook(() => useAppBottomInset('flow-bar', 96, true));

    flowBar.unmount();

    expect(inset()).toBe('28px');
  });
});

describe('readAppBottomInset', () => {
  it('reads back nothing as zero', () => {
    expect(readAppBottomInset()).toBe(0);
  });

  it('ignores a value it cannot parse', () => {
    document.documentElement.style.setProperty('--app-bottom-inset', 'auto');

    expect(readAppBottomInset()).toBe(0);
  });
});

describe('subscribeAppBottomInset', () => {
  it('notifies while the published inset changes, and stops once unsubscribed', () => {
    const changes: number[] = [];
    const unsubscribe = subscribeAppBottomInset(() => changes.push(readAppBottomInset()));

    const banner = renderHook(() => useAppBottomInset('upload-banner', 28, true));
    expect(changes).toEqual([28]);

    const flowBar = renderHook(() => useAppBottomInset('flow-bar', 96, true));
    expect(changes).toEqual([28, 96]);

    flowBar.unmount();
    expect(changes).toEqual([28, 96, 28]);

    unsubscribe();
    banner.unmount();
    expect(changes).toEqual([28, 96, 28]);
  });

  // A shorter bar arriving under a taller one leaves the published figure alone, and consumers
  // that recompute on notification shouldn't be woken for a value that did not move.
  it('stays quiet when a change leaves the published inset where it was', () => {
    renderHook(() => useAppBottomInset('flow-bar', 96, true));

    let notifications = 0;
    const unsubscribe = subscribeAppBottomInset(() => {
      notifications += 1;
    });
    const banner = renderHook(() => useAppBottomInset('upload-banner', 28, true));

    expect(readAppBottomInset()).toBe(96);
    expect(notifications).toBe(0);

    banner.unmount();
    unsubscribe();
    expect(notifications).toBe(0);
  });
});

describe('bottom inset classes', () => {
  // Tailwind finds classes by scanning source text, so the offset cannot be interpolated into
  // them and each class spells it out again. A panel whose ceiling subtracted a different figure
  // than its offset added hung off the top of the screen by the difference.
  it('size and offset against the same expression', () => {
    expect(BOTTOM_INSET_OFFSET_CLASS).toContain(BOTTOM_INSET_OFFSET_EXPRESSION);
    expect(BOTTOM_INSET_MAX_HEIGHT_CLASS).toContain(BOTTOM_INSET_OFFSET_EXPRESSION);
  });
});
