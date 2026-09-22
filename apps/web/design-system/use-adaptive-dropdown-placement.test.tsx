import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppBottomInset } from '~/core/app-bottom-inset';

import { useAdaptiveDropdownPlacement } from './use-adaptive-dropdown-placement';

const VIEWPORT_HEIGHT = 800;

/**
 * An anchor sitting low enough that the default 220px dropdown fits below it — but only just.
 *
 * 560 leaves 240px below, which clears the 220 + 8 gap by 12px. Any bar claiming more than that
 * from the bottom takes the fit away, which is the whole point of these cases.
 */
function anchorAt(top: number) {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({ top, bottom: top, left: 400, right: 500, width: 100, height: 0 }) as DOMRect;
  document.body.append(element);
  return { current: element } as React.RefObject<Element | null>;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.documentElement.style.removeProperty('--app-bottom-inset');
});

describe('useAdaptiveDropdownPlacement', () => {
  it('opens below an anchor with room under it', () => {
    const anchor = anchorAt(560);
    const { result } = renderHook(() => useAdaptiveDropdownPlacement(anchor, { isOpen: true }));

    expect(result.current.side).toBe('bottom');
  });

  it('opens above when a bar has already claimed the bottom', () => {
    const anchor = anchorAt(560);
    renderHook(() => useAppBottomInset('flow-bar', 96, true));

    const { result } = renderHook(() => useAdaptiveDropdownPlacement(anchor, { isOpen: true }));

    expect(result.current.side).toBe('top');
  });

  // The case the subscription exists for: the bar arrives *after* the dropdown has opened and
  // measured. Nothing resizes and nothing scrolls, so without being told the dropdown keeps the
  // placement it chose and sits underneath the bar.
  it('flips up when a bar claims the bottom while it is already open', async () => {
    const anchor = anchorAt(560);
    const { result } = renderHook(() => useAdaptiveDropdownPlacement(anchor, { isOpen: true }));

    expect(result.current.side).toBe('bottom');

    const bar = renderHook(() => useAppBottomInset('flow-bar', 96, true));
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    });

    expect(result.current.side).toBe('top');

    // It stays up when the bar leaves again, which is the hook's existing hysteresis rather than
    // anything to do with the inset: an open dropdown keeps a side that still fits, so a bar
    // flickering in and out can't make it jump around. Reopening measures afresh.
    bar.unmount();
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    });

    expect(result.current.side).toBe('top');
  });

  it('stops listening for inset changes once closed', async () => {
    const anchor = anchorAt(560);
    const { result, rerender } = renderHook(
      ({ isOpen }) => useAdaptiveDropdownPlacement(anchor, { isOpen }),
      { initialProps: { isOpen: true } }
    );

    expect(result.current.side).toBe('bottom');
    rerender({ isOpen: false });

    renderHook(() => useAppBottomInset('flow-bar', 96, true));
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    });

    // A closed dropdown has nothing on screen to move, and reopening measures afresh.
    expect(result.current.side).toBe('bottom');
  });
});
