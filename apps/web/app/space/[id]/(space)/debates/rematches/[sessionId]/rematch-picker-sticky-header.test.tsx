import '@testing-library/jest-dom/vitest';

import * as React from 'react';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RematchPickerHeaderContext, RematchPickerStickyHeader } from './rematch-picker-sticky-header';

const flags = vi.hoisted(() => ({ video: true, reducedMotion: false }));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => flags.video }));
vi.mock('framer-motion', async importOriginal => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => flags.reducedMotion,
}));

function ExpandControl() {
  const header = React.useContext(RematchPickerHeaderContext);
  return header?.compact ? <button onClick={header.expand}>Show full participant videos</button> : null;
}

function setup() {
  const view = render(
    <div data-rematch-scroll data-testid="scroll-container">
      <RematchPickerStickyHeader>
        <video data-testid="camera" />
        <button>Mute microphone</button>
        <ExpandControl />
      </RematchPickerStickyHeader>
      <p>Claim list</p>
    </div>
  );
  const scroller = screen.getByTestId('scroll-container');
  const header = screen.getByTestId('rematch-sticky-header');
  const scroll = (top: number) => {
    scroller.scrollTop = top;
    fireEvent.scroll(scroller);
  };
  return { ...view, scroller, header, scroll };
}

beforeEach(() => {
  flags.video = true;
  flags.reducedMotion = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { height: this.dataset.compact === 'true' ? 180 : 360 } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('folding picker videos', () => {
  it('folds after a short scroll and restores at the top, with a gap between the thresholds', () => {
    const { header, scroll } = setup();
    scroll(96);
    expect(header).toHaveAttribute('data-compact', 'false');
    scroll(97);
    expect(header).toHaveAttribute('data-compact', 'true');
    scroll(90);
    scroll(20);
    expect(header).toHaveAttribute('data-compact', 'true');
    scroll(0);
    expect(header).toHaveAttribute('data-compact', 'false');
  });

  it('reserves the lost height without replacing the video or moving the scroll position', async () => {
    const { header, scroller, scroll } = setup();
    const camera = screen.getByTestId('camera');
    const mute = screen.getByRole('button', { name: 'Mute microphone' });
    mute.focus();
    scroll(140);
    await waitFor(() => expect(header.nextElementSibling).toHaveStyle({ height: '180px' }));
    expect(scroller.scrollTop).toBe(140);
    expect(screen.getByTestId('camera')).toBe(camera);
    expect(mute).toHaveFocus();
    scroll(0);
    await waitFor(() => expect(header.nextElementSibling).toHaveStyle({ height: '0px' }));
  });

  it('expands on demand and returns to the top without animated scrolling', () => {
    const { header, scroller, scroll } = setup();
    scroll(200);
    fireEvent.click(screen.getByRole('button', { name: 'Show full participant videos' }));
    expect(header).toHaveAttribute('data-compact', 'false');
    expect(scroller.scrollTop).toBe(0);
    expect(header).toHaveFocus();
  });

  it('shrinks through intermediate heights while preserving the combined header and spacer height', async () => {
    const { header, scroll, scroller } = setup();
    const camera = screen.getByTestId('camera');
    const spacer = header.nextElementSibling as HTMLElement;
    await waitFor(() => expect(header).toHaveStyle({ height: '360px' }));
    scroll(150);
    await waitFor(
      () => {
        const height = parseFloat(header.style.height);
        expect(height).toBeGreaterThan(180);
        expect(height).toBeLessThan(360);
        expect(height + parseFloat(spacer.style.height)).toBeCloseTo(360, 0);
      },
      { interval: 10 }
    );
    expect(scroller.scrollTop).toBe(150);
    // Reversing an in-flight fold also keeps the same media and returns to the original height.
    scroll(0);
    await waitFor(() => expect(header).toHaveStyle({ height: '360px' }));
    await waitFor(() => expect(spacer).toHaveStyle({ height: '0px' }));
    expect(screen.getByTestId('camera')).toBe(camera);
  });

  it('skips the shrinking animation when reduced motion is enabled', async () => {
    flags.reducedMotion = true;
    const { header, scroll } = setup();
    await waitFor(() => expect(header).toHaveStyle({ height: '360px' }));
    scroll(150);
    await act(() => new Promise(resolve => setTimeout(resolve, 30)));
    expect(header).toHaveStyle({ height: '180px' });
    expect(header.nextElementSibling).toHaveStyle({ height: '180px' });
  });

  it('does not fold when the video feature is disabled', () => {
    flags.video = false;
    const { header, scroll } = setup();
    scroll(300);
    expect(header).toHaveAttribute('data-compact', 'false');
  });

  it('remeasures when header content changes and disconnects its observer on unmount', async () => {
    let resize: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      }
    );
    const { header, scroll, unmount } = setup();
    scroll(200);
    vi.spyOn(header.querySelector('[data-compact]')!, 'getBoundingClientRect').mockReturnValue({
      height: 220,
    } as DOMRect);
    act(() => resize());
    await waitFor(() => expect(header.nextElementSibling).toHaveStyle({ height: '140px' }));
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
