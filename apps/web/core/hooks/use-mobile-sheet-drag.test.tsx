import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import type { MotionValue } from 'framer-motion';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileSheetSurface } from '~/design-system/mobile-sheet-surface';

import { useMobileSheetDrag } from './use-mobile-sheet-drag';

const PEEK = 200;

const mocks = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock('framer-motion', async importOriginal => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => mocks.reducedMotion,
}));

afterEach(() => {
  cleanup();
  mocks.reducedMotion = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Sheet({
  topRef,
  open = true,
  onDismiss = () => {},
  fitContent = false,
  resetKey,
}: {
  topRef: { current: MotionValue<number> | null };
  open?: boolean;
  onDismiss?: () => void;
  fitContent?: boolean;
  resetKey?: string;
}) {
  const [peekContent, setPeekContent] = React.useState<HTMLDivElement | null>(null);
  const { setOverlayElement, sheetStyle, sheet, snap } = useMobileSheetDrag({
    enabled: open,
    onDismiss,
    peekTopPx: PEEK,
    peekContent,
    resetKey,
  });
  topRef.current = sheetStyle.top;
  // Like the real sheets, the surface only exists while open; the hook outlives it.
  if (!open) return null;
  return (
    <div ref={setOverlayElement} data-snap={snap}>
      <MobileSheetSurface sheetStyle={sheetStyle} sheet={sheet}>
        <div data-mobile-sheet-scroll>
          <div ref={fitContent ? setPeekContent : undefined} data-peek-content>
            <span data-testid="content" />
          </div>
        </div>
      </MobileSheetSurface>
    </div>
  );
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', target: Element, clientY?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: clientY === undefined ? [] : [{ clientX: 20, clientY, identifier: 1, target }],
  });
  target.dispatchEvent(event);
}

describe('useMobileSheetDrag', () => {
  describe('content-sized previews', () => {
    function setup() {
      let contentHeight = 200;
      const observers = new Set<() => void>();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            observers.add(callback);
          }
          observe() {}
          disconnect() {}
        }
      );
      // Header + grab handle take 60px outside the independently scrolling content.
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500);
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(440);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return { height: this.hasAttribute('data-peek-content') ? contentHeight : 0 } as DOMRect;
      });
      const topRef: { current: MotionValue<number> | null } = { current: null };
      const view = render(<Sheet topRef={topRef} fitContent resetKey="first" />);
      const surface = view.container.querySelector<HTMLElement>('[data-mobile-sheet-surface]')!;
      surface.getBoundingClientRect = () => ({ top: topRef.current?.get() ?? 0 }) as DOMRect;
      return {
        ...view,
        topRef,
        resize: (height: number) =>
          act(() => {
            contentHeight = height;
            observers.forEach(callback => callback());
          }),
      };
    }

    it('fits short content including the chrome, and caps long content at the old maximum', () => {
      const view = setup();
      expect(view.topRef.current?.get()).toBe(window.innerHeight - 260);
      view.resize(1000);
      expect(view.topRef.current?.get()).toBe(PEEK);
      view.resize(300);
      expect(view.topRef.current?.get()).toBe(window.innerHeight - 360);
    });

    it('uses the fitted position for drag releases and preserves full screen across content changes', async () => {
      const view = setup();
      const content = view.getByTestId('content');
      const fittedTop = window.innerHeight - 260;
      let time = 0;
      const drag = (distance: number) => {
        const clock = vi.spyOn(performance, 'now').mockImplementation(() => time);
        act(() => {
          touch('touchstart', content, 600);
          time += 100;
          touch('touchmove', content, 600 + distance);
          time += 100;
          touch('touchend', content);
        });
        clock.mockRestore();
      };
      drag(-20);
      await act(() => new Promise(resolve => setTimeout(resolve, 900)));
      expect(view.topRef.current?.get()).toBeCloseTo(fittedTop, 0);
      drag(-150);
      await act(() => new Promise(resolve => setTimeout(resolve, 900)));
      expect(view.topRef.current?.get()).toBeCloseTo(0, 0);
      expect(view.container.firstElementChild?.getAttribute('data-snap')).toBe('full');
      view.resize(1000);
      expect(view.topRef.current?.get()).toBeCloseTo(0, 0);

      view.rerender(<Sheet topRef={view.topRef} fitContent resetKey="second" />);
      expect(view.container.firstElementChild?.getAttribute('data-snap')).toBe('peek');
      expect(view.topRef.current?.get()).toBe(PEEK);
    });
  });

  it('picks a drag up from where the sheet visibly is while it is still sliding in', () => {
    const topRef: { current: MotionValue<number> | null } = { current: null };
    const { container, getByTestId } = render(<Sheet topRef={topRef} />);
    const surface = container.querySelector<HTMLElement>('[data-mobile-sheet-surface]');
    if (!surface) throw new Error('Missing surface');
    // Mid-entrance: the slide-up transform still holds the surface 300px below its `top`.
    surface.getBoundingClientRect = () => ({ top: PEEK + 300 }) as DOMRect;

    const content = getByTestId('content');
    act(() => {
      touch('touchstart', content, 600);
      touch('touchmove', content, 500);
    });

    // The sheet follows the finger from its visible edge (500), not from `top` (200).
    expect(topRef.current?.get()).toBe(PEEK + 300 - 100);
    act(() => touch('touchend', content));
  });

  describe('releases and interruptions', () => {
    /** Opens a sheet resting as a container, whose surface reports where `top` puts it. */
    function openSheet(onDismiss = vi.fn()) {
      const topRef: { current: MotionValue<number> | null } = { current: null };
      const view = render(<Sheet topRef={topRef} onDismiss={onDismiss} />);
      const surface = view.container.querySelector<HTMLElement>('[data-mobile-sheet-surface]');
      if (!surface) throw new Error('Missing surface');
      surface.getBoundingClientRect = () => ({ top: topRef.current?.get() ?? 0 }) as DOMRect;
      const top = () => topRef.current?.get() ?? NaN;
      return { ...view, top, content: view.getByTestId('content'), onDismiss };
    }

    /** A slow drag, 100ms between moves, so the release reads as a placement, not a fling. */
    function slowDrag(content: Element, from: number, to: number, end: 'touchend' | 'touchcancel' = 'touchend') {
      let clock = 0;
      const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
      act(() => {
        touch('touchstart', content, from);
        for (let step = 1; step <= 4; step++) {
          clock += 100;
          touch('touchmove', content, from + ((to - from) * step) / 4);
        }
        clock += 100;
        touch(end, content);
      });
      now.mockRestore();
    }

    const settle = (ms = 900) => act(() => new Promise(resolve => setTimeout(resolve, ms)));

    it('settles full screen after a long upward drag', async () => {
      const sheet = openSheet();
      slowDrag(sheet.content, 600, 450);
      await settle();
      expect(sheet.top()).toBeCloseTo(0, 0);
    });

    it('springs back to the container after a short drag', async () => {
      const sheet = openSheet();
      slowDrag(sheet.content, 600, 570);
      await settle();
      expect(sheet.top()).toBeCloseTo(PEEK, 0);
    });

    it('slides off the screen before closing when pulled down far enough', async () => {
      const sheet = openSheet();
      slowDrag(sheet.content, 400, 520);
      expect(sheet.onDismiss).not.toHaveBeenCalled();
      await settle(400);
      expect(sheet.onDismiss).toHaveBeenCalledTimes(1);
      expect(sheet.top()).toBe(window.innerHeight);
    });

    it('returns to where it started when the drag is interrupted', async () => {
      const sheet = openSheet();
      // Far enough to expand if it were released, but the OS cancels it instead.
      slowDrag(sheet.content, 600, 450, 'touchcancel');
      await settle();
      expect(sheet.top()).toBeCloseTo(PEEK, 0);
    });

    it('reopens as a container after closing from full screen', async () => {
      const topRef: { current: MotionValue<number> | null } = { current: null };
      const { rerender } = render(<Sheet topRef={topRef} />);
      act(() => topRef.current?.jump(0));

      rerender(<Sheet topRef={topRef} open={false} />);
      rerender(<Sheet topRef={topRef} />);

      expect(topRef.current?.get()).toBe(PEEK);
    });

    it('snaps without animating when the viewer prefers reduced motion', async () => {
      mocks.reducedMotion = true;
      const sheet = openSheet();
      slowDrag(sheet.content, 600, 450);
      // One frame, not a spring's worth.
      await settle(50);
      expect(sheet.top()).toBe(0);
    });
  });
});
