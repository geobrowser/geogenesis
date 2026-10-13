import { act, render } from '@testing-library/react';

import * as React from 'react';

import type { MotionValue } from 'framer-motion';
import { describe, expect, it } from 'vitest';

import { MobileSheetSurface } from '~/design-system/mobile-sheet-surface';

import { useMobileSheetDrag } from './use-mobile-sheet-drag';

const PEEK = 200;

function Sheet({ topRef, open = true }: { topRef: { current: MotionValue<number> | null }; open?: boolean }) {
  const { setOverlayElement, sheetStyle } = useMobileSheetDrag({ enabled: open, onDismiss: () => {}, peekTopPx: PEEK });
  topRef.current = sheetStyle.top;
  // Like the real sheets, the surface only exists while open; the hook outlives it.
  if (!open) return null;
  return (
    <div ref={setOverlayElement}>
      <MobileSheetSurface sheetStyle={sheetStyle}>
        <div data-mobile-sheet-scroll>
          <span data-testid="content" />
        </div>
      </MobileSheetSurface>
    </div>
  );
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend', target: Element, clientY?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: clientY === undefined ? [] : [{ clientX: 20, clientY, identifier: 1, target }],
  });
  target.dispatchEvent(event);
}

describe('useMobileSheetDrag', () => {
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
});
