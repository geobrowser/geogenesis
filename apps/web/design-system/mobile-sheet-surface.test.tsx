import { act, cleanup, render, waitFor } from '@testing-library/react';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { type MobileSheetStyle, useMobileSheetDrag } from '~/core/hooks/use-mobile-sheet-drag';

import { MobileSheetSurface } from './mobile-sheet-surface';

const mocks = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock('framer-motion', async importOriginal => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => mocks.reducedMotion,
}));

// jsdom has no Web Animations API. Supply its playback boundary while keeping Motion's real
// backend selection, keyframe generation and interruption logic under test.
const animate = vi.fn(function (this: Element) {
  return {
    playState: 'running',
    currentTime: 100,
    startTime: 0,
    playbackRate: 1,
    cancel: vi.fn(),
  } as unknown as Animation;
});
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
});

afterEach(() => {
  cleanup();
  animate.mockClear();
  mocks.reducedMotion = false;
});

afterAll(() => {
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});

function Sheet({
  styleRef,
  surfaceIds = ['sheet'],
}: {
  styleRef: { current: MobileSheetStyle | null };
  surfaceIds?: string[];
}) {
  const { setOverlayElement, sheetStyle, sheetControlsRef, sheet } = useMobileSheetDrag({
    enabled: surfaceIds.length > 0,
    onDismiss: () => {},
    peekTopPx: 200,
  });
  styleRef.current = sheetStyle;
  return (
    <div ref={setOverlayElement}>
      {surfaceIds.map(id => (
        <MobileSheetSurface key={id} sheetStyle={sheetStyle} sheetControlsRef={sheetControlsRef} sheet={sheet}>
          <div data-mobile-sheet-scroll data-testid="content" />
        </MobileSheetSurface>
      ))}
    </div>
  );
}

describe('MobileSheetSurface entrance', () => {
  // Motion also calls animate() on a detached element while detecting browser capabilities.
  const slideCallIndex = () =>
    animate.mock.contexts.findIndex(element => (element as Element).hasAttribute('data-mobile-sheet-surface'));

  it('hands the slide to the browser animation engine', async () => {
    render(<Sheet styleRef={{ current: null }} />);

    await waitFor(() => expect(slideCallIndex()).toBeGreaterThanOrEqual(0));
    expect(animate.mock.calls[slideCallIndex()]).toEqual([
      expect.objectContaining({ transform: ['translateY(100%)', 'translateY(0%)'] }),
      expect.objectContaining({ fill: 'both' }),
    ]);
  });

  it('cancels the native entrance and continues a swipe from the visible edge', async () => {
    const styleRef: { current: MobileSheetStyle | null } = { current: null };
    const { container, getByTestId } = render(<Sheet styleRef={styleRef} />);
    await waitFor(() => expect(slideCallIndex()).toBeGreaterThanOrEqual(0));
    const animation = animate.mock.results[slideCallIndex()].value as Animation;
    const surface = container.querySelector<HTMLElement>('[data-mobile-sheet-surface]')!;
    surface.getBoundingClientRect = () => ({ top: 500 }) as DOMRect;
    const content = getByTestId('content');

    act(() => {
      for (const [type, clientY] of [
        ['touchstart', 600],
        ['touchmove', 500],
      ] as const) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', {
          value: [{ clientX: 20, clientY, identifier: 1, target: content }],
        });
        content.dispatchEvent(event);
      }
    });

    expect(animation.cancel).toHaveBeenCalled();
    expect(styleRef.current?.top.get()).toBe(400);
    await waitFor(() => expect(surface.style.transform).toBe('translateY(0%)'));
  });

  it('opens in place when reduced motion is requested', () => {
    mocks.reducedMotion = true;
    const { container } = render(<Sheet styleRef={{ current: null }} />);
    const surface = container.querySelector<HTMLElement>('[data-mobile-sheet-surface]')!;

    expect(surface.style.transform).toBe('translateY(0%)');
    expect(animate).not.toHaveBeenCalled();
  });

  it('replays the entrance at container height after closing from full screen', async () => {
    const styleRef: { current: MobileSheetStyle | null } = { current: null };
    const { rerender } = render(<Sheet styleRef={styleRef} />);
    await waitFor(() => expect(slideCallIndex()).toBeGreaterThanOrEqual(0));
    const firstSlide = slideCallIndex();
    act(() => styleRef.current?.top.jump(0));

    rerender(<Sheet styleRef={styleRef} surfaceIds={[]} />);
    rerender(<Sheet styleRef={styleRef} />);

    await waitFor(() => expect(animate.mock.calls.length).toBeGreaterThan(firstSlide + 1));
    expect(styleRef.current?.top.get()).toBe(200);
    expect(animate.mock.calls.at(-1)).toEqual([
      expect.objectContaining({ transform: ['translateY(100%)', 'translateY(0%)'] }),
      expect.anything(),
    ]);
  });

  it('keeps the new preview animating when its exiting predecessor unmounts', async () => {
    const styleRef: { current: MobileSheetStyle | null } = { current: null };
    const { rerender } = render(<Sheet styleRef={styleRef} surfaceIds={['old']} />);
    await waitFor(() => expect(slideCallIndex()).toBeGreaterThanOrEqual(0));
    const firstSlide = slideCallIndex();

    rerender(<Sheet styleRef={styleRef} surfaceIds={['old', 'new']} />);
    await waitFor(() => expect(animate.mock.calls.length).toBeGreaterThan(firstSlide + 1));
    const newAnimation = animate.mock.results.at(-1)!.value as Animation;
    rerender(<Sheet styleRef={styleRef} surfaceIds={['new']} />);

    expect(newAnimation.cancel).not.toHaveBeenCalled();
  });
});
