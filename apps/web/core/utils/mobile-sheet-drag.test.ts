import { describe, expect, it, vi } from 'vitest';

import {
  type MobileSheetSnap,
  attachMobileSheetGestures,
  canStartMobileSheetGesture,
  getTopMobileSheet,
  lockMobileSheetDocumentOverscroll,
  resolveMobileSheetRelease,
  shouldClaimMobileSheetGesture,
  subscribeMobileSheetOpen,
} from './mobile-sheet-drag';

function createSheet(initialScrollTop = 0) {
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-testid="backdrop"></div>
    <section data-mobile-sheet-surface>
      <div data-mobile-sheet-drag-handle><span data-testid="handle-child"></span></div>
      <header><span data-testid="header"></span><button data-testid="button">Open</button></header>
      <main data-mobile-sheet-scroll>
        <span data-testid="content"></span>
        <a data-testid="link" href="#">Entity</a>
        <input data-testid="input" />
        <div contenteditable="true"><span data-testid="editable"></span></div>
      </main>
    </section>
  `;

  const scrollEl = root.querySelector<HTMLElement>('[data-mobile-sheet-scroll]');
  if (!scrollEl) throw new Error('Missing test scroll surface');
  let scrollTop = initialScrollTop;
  Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, get: () => scrollTop });

  const target = (testId: string) => {
    const element = root.querySelector(`[data-testid="${testId}"]`);
    if (!element) throw new Error(`Missing test target: ${testId}`);
    return element;
  };

  return { root, target, setScrollTop: (value: number) => (scrollTop = value) };
}

describe('canStartMobileSheetGesture', () => {
  it('starts from content, chrome, links and buttons, so a swipe anywhere can move the sheet', () => {
    const { root, target } = createSheet();

    for (const testId of ['content', 'header', 'button', 'link', 'handle-child']) {
      expect(canStartMobileSheetGesture(target(testId), root)).toBe(true);
    }
  });

  it('leaves text entry alone', () => {
    const { root, target } = createSheet();

    expect(canStartMobileSheetGesture(target('input'), root)).toBe(false);
    expect(canStartMobileSheetGesture(target('editable'), root)).toBe(false);
  });

  it('does not start from the backdrop', () => {
    const { root, target } = createSheet();

    expect(canStartMobileSheetGesture(target('backdrop'), root)).toBe(false);
  });
});

describe('shouldClaimMobileSheetGesture', () => {
  const claim = (snap: MobileSheetSnap, direction: 'up' | 'down', contentScrollTop = 0, onHandle = false) =>
    shouldClaimMobileSheetGesture({ snap, direction, onHandle, contentScrollTop });

  it('expands from an upward swipe on the container instead of scrolling its content', () => {
    expect(claim('peek', 'up')).toBe(true);
    expect(claim('peek', 'up', 40)).toBe(true);
  });

  it('scrolls natively upward once full screen', () => {
    expect(claim('full', 'up')).toBe(false);
  });

  it('takes a downward swipe only when the content is at its top', () => {
    expect(claim('peek', 'down')).toBe(true);
    expect(claim('full', 'down')).toBe(true);
    expect(claim('peek', 'down', 24)).toBe(false);
    expect(claim('full', 'down', 24)).toBe(false);
  });

  it('always lets the handle move the sheet', () => {
    expect(claim('full', 'up', 0, true)).toBe(true);
    expect(claim('full', 'down', 24, true)).toBe(true);
  });
});

describe('resolveMobileSheetRelease', () => {
  const PEEK = 200;
  const release = (
    from: MobileSheetSnap,
    top: number,
    { velocityY = 0, scrolledSinceFull = false }: { velocityY?: number; scrolledSinceFull?: boolean } = {}
  ) => resolveMobileSheetRelease({ from, top, velocityY, peekTop: PEEK, scrolledSinceFull });

  it('goes full screen from a long or fast upward drag on the container', () => {
    expect(release('peek', 100)).toBe('full');
    expect(release('peek', 180, { velocityY: -800 })).toBe('full');
  });

  it('springs back to the container from a short drag either way', () => {
    expect(release('peek', 170)).toBe('peek');
    expect(release('peek', 240)).toBe('peek');
  });

  it('dismisses the container from a long or fast downward drag', () => {
    expect(release('peek', 300)).toBe('dismiss');
    expect(release('peek', 220, { velocityY: 800 })).toBe('dismiss');
  });

  it('stays full screen from a small pull', () => {
    expect(release('full', 30, { scrolledSinceFull: true })).toBe('full');
    expect(release('full', 30)).toBe('full');
  });

  it('returns to the container when pulled down after the content was scrolled', () => {
    expect(release('full', 120, { scrolledSinceFull: true })).toBe('peek');
    expect(release('full', 40, { velocityY: 800, scrolledSinceFull: true })).toBe('peek');
  });

  it('dismisses in one motion when pulled straight back down before scrolling', () => {
    expect(release('full', 120)).toBe('dismiss');
    expect(release('full', 40, { velocityY: 800 })).toBe('dismiss');
  });

  it('dismisses from full screen when pulled past the container', () => {
    expect(release('full', 320, { scrolledSinceFull: true })).toBe('dismiss');
  });

  it('lets a fling decide the direction when the release reverses the drag', () => {
    // Dragged up past the expand threshold, then flicked back down: back to the container.
    expect(release('peek', 100, { velocityY: 800 })).toBe('peek');
    // Pulled down past the dismiss threshold, then flicked back up: back to the container.
    expect(release('peek', 300, { velocityY: -800 })).toBe('peek');
    // Pulled down from full screen, then flicked back up: stays full screen.
    expect(release('full', 120, { velocityY: -800, scrolledSinceFull: true })).toBe('full');
    expect(release('full', 120, { velocityY: -800 })).toBe('full');
  });

  it('settles a fling at the next stop in its direction', () => {
    expect(release('full', 120, { velocityY: 800, scrolledSinceFull: true })).toBe('peek');
    expect(release('full', 240, { velocityY: 800, scrolledSinceFull: true })).toBe('dismiss');
    expect(release('peek', 240, { velocityY: -800 })).toBe('peek');
  });
});

describe('lockMobileSheetDocumentOverscroll', () => {
  it('keeps the document locked until every stacked sheet releases it', () => {
    const releaseFirst = lockMobileSheetDocumentOverscroll();
    const releaseSecond = lockMobileSheetDocumentOverscroll();

    expect(document.documentElement.hasAttribute('data-mobile-sheet-open')).toBe(true);
    expect(document.body.hasAttribute('data-mobile-sheet-open')).toBe(true);

    releaseFirst();
    expect(document.documentElement.hasAttribute('data-mobile-sheet-open')).toBe(true);
    expect(document.body.hasAttribute('data-mobile-sheet-open')).toBe(true);

    releaseSecond();
    expect(document.documentElement.hasAttribute('data-mobile-sheet-open')).toBe(false);
    expect(document.body.hasAttribute('data-mobile-sheet-open')).toBe(false);
  });

  it('tracks which sheet is on top and tells subscribers only when that changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMobileSheetOpen(listener);
    const bottom = Symbol('bottom');
    const top = Symbol('top');

    const releaseBottom = lockMobileSheetDocumentOverscroll(bottom);
    expect(getTopMobileSheet()).toBe(bottom);
    const releaseTop = lockMobileSheetDocumentOverscroll(top);
    expect(getTopMobileSheet()).toBe(top);

    // Closing the one underneath leaves the top where it is.
    releaseBottom();
    expect(getTopMobileSheet()).toBe(top);
    releaseTop();
    expect(getTopMobileSheet()).toBe(null);

    // bottom opens, top opens, top closes: three changes; the bottom closing under it is not one.
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it('allows cleanup to be called more than once without unlocking another sheet', () => {
    const releaseFirst = lockMobileSheetDocumentOverscroll();
    const releaseSecond = lockMobileSheetDocumentOverscroll();

    releaseFirst();
    releaseFirst();
    expect(document.documentElement.hasAttribute('data-mobile-sheet-open')).toBe(true);

    releaseSecond();
    expect(document.documentElement.hasAttribute('data-mobile-sheet-open')).toBe(false);
  });
});

function touchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: Element,
  clientY?: number,
  clientX = 20
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: clientY === undefined ? [] : [{ clientX, clientY, identifier: 1, target }],
  });
  target.dispatchEvent(event);
  return event;
}

function attach(
  sheet: ReturnType<typeof createSheet>,
  initialSnap: MobileSheetSnap,
  initialTop: number,
  { canStart = () => true }: { canStart?: () => boolean } = {}
) {
  let snap = initialSnap;
  let top = initialTop;
  const onDragEnd = vi.fn();
  const onDragCancel = vi.fn();
  const detach = attachMobileSheetGestures(sheet.root, {
    canStart,
    getSnap: () => snap,
    getTop: () => top,
    onDragStart: () => {},
    onDragMove: next => (top = next),
    onDragEnd,
    onDragCancel,
  });
  return { detach, onDragEnd, onDragCancel, getTop: () => top, setSnap: (next: MobileSheetSnap) => (snap = next) };
}

describe('attachMobileSheetGestures', () => {
  it('moves the container up with an upward swipe on its content and cancels the native scroll', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200);

    touchEvent('touchstart', sheet.target('content'), 400);
    const move = touchEvent('touchmove', sheet.target('content'), 300);
    touchEvent('touchend', sheet.target('content'));

    expect(move.defaultPrevented).toBe(true);
    expect(gestures.getTop()).toBe(100);
    expect(gestures.onDragEnd).toHaveBeenCalledWith(100, expect.any(Number));
    gestures.detach();
  });

  it('leaves an upward swipe native once full screen', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'full', 0);

    touchEvent('touchstart', sheet.target('content'), 400);
    const move = touchEvent('touchmove', sheet.target('content'), 300);
    touchEvent('touchend', sheet.target('content'));

    expect(move.defaultPrevented).toBe(false);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });

  it('hands a full-screen scroll to the sheet when it reaches the top and keeps pulling', () => {
    const sheet = createSheet(30);
    const gestures = attach(sheet, 'full', 0);

    touchEvent('touchstart', sheet.target('content'), 300);
    const scrolling = touchEvent('touchmove', sheet.target('content'), 320);
    expect(scrolling.defaultPrevented).toBe(false);

    sheet.setScrollTop(0);
    touchEvent('touchmove', sheet.target('content'), 330);
    const pulling = touchEvent('touchmove', sheet.target('content'), 410);
    touchEvent('touchend', sheet.target('content'));

    expect(pulling.defaultPrevented).toBe(true);
    expect(gestures.getTop()).toBe(80);
    gestures.detach();
  });

  it('cancels an interrupted drag instead of committing its release', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200);

    touchEvent('touchstart', sheet.target('content'), 400);
    touchEvent('touchmove', sheet.target('content'), 250);
    touchEvent('touchcancel', sheet.target('content'));

    expect(gestures.onDragCancel).toHaveBeenCalledTimes(1);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });

  it('cancels a drag when a second finger lands', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200);

    touchEvent('touchstart', sheet.target('content'), 400);
    touchEvent('touchmove', sheet.target('content'), 250);
    const twoFingers = new Event('touchstart', { bubbles: true, cancelable: true }) as TouchEvent;
    Object.defineProperty(twoFingers, 'touches', {
      value: [
        { clientX: 20, clientY: 250, identifier: 1 },
        { clientX: 80, clientY: 300, identifier: 2 },
      ],
    });
    sheet.target('content').dispatchEvent(twoFingers);
    touchEvent('touchend', sheet.target('content'));

    expect(gestures.onDragCancel).toHaveBeenCalledTimes(1);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });

  it('cancels a mouse drag on the handle when the pointer is cancelled', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200);
    const pointer = (type: string, target: EventTarget, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerType: 'mouse', pointerId: 7, button: 0, clientX: 20, clientY });
      target.dispatchEvent(event);
    };

    pointer('pointerdown', sheet.target('handle-child'), 200);
    pointer('pointermove', window, 100);
    pointer('pointercancel', window, 100);

    expect(gestures.onDragCancel).toHaveBeenCalledTimes(1);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });

  it('lets a 1px jitter at the top of a full-screen scroll stay a scroll', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'full', 0);

    // Starting to scroll the content up; the content has not moved off its top yet.
    touchEvent('touchstart', sheet.target('content'), 400);
    touchEvent('touchmove', sheet.target('content'), 390);
    const jitter = touchEvent('touchmove', sheet.target('content'), 391);
    const scroll = touchEvent('touchmove', sheet.target('content'), 370);
    touchEvent('touchend', sheet.target('content'));

    expect(jitter.defaultPrevented).toBe(false);
    expect(scroll.defaultPrevented).toBe(false);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });

  it('does not watch the window for a handle press it refused', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200, { canStart: () => false });
    const addListener = vi.spyOn(window, 'addEventListener');

    const press = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.assign(press, { pointerType: 'mouse', pointerId: 7, button: 0, clientX: 20, clientY: 200 });
    sheet.target('handle-child').dispatchEvent(press);

    expect(addListener).not.toHaveBeenCalled();
    addListener.mockRestore();
    gestures.detach();
  });

  it('ignores new gestures while the sheet is on its way out', () => {
    const sheet = createSheet();
    // A drag would stop the dismiss animation, whose promise then never settles: the sheet would
    // stay stranded part-way down with dismissal locked.
    const gestures = attach(sheet, 'peek', 400, { canStart: () => false });

    touchEvent('touchstart', sheet.target('content'), 400);
    const move = touchEvent('touchmove', sheet.target('content'), 300);
    touchEvent('touchend', sheet.target('content'));

    expect(move.defaultPrevented).toBe(false);
    expect(gestures.getTop()).toBe(400);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });

  it('reports no fling when the finger holds still before lifting', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200);
    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(0);
    touchEvent('touchstart', sheet.target('content'), 400);
    // A quick 50px pull: short of the 72px dismiss threshold, but fast enough to read as a fling.
    for (const [time, y] of [
      [0, 410],
      [16, 425],
      [32, 440],
      [48, 450],
    ]) {
      now.mockReturnValue(time);
      touchEvent('touchmove', sheet.target('content'), y);
    }
    now.mockReturnValue(400);
    touchEvent('touchend', sheet.target('content'));

    expect(gestures.onDragEnd).toHaveBeenCalledWith(250, 0);
    now.mockRestore();
    gestures.detach();
  });

  it('measures fling speed from touch-down, not from when the sheet claimed the drag', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200);
    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(0);
    touchEvent('touchstart', sheet.target('content'), 400);
    // Tap jitter: 5px in 16ms, lifted at 24ms. That's ~208 px/s, well under a fling.
    now.mockReturnValue(16);
    touchEvent('touchmove', sheet.target('content'), 395);
    now.mockReturnValue(24);
    touchEvent('touchend', sheet.target('content'));

    const [, velocityY] = gestures.onDragEnd.mock.calls[0];
    expect(Math.round(velocityY)).toBe(-208);
    now.mockRestore();
    gestures.detach();
  });

  it('leaves swipes inside a nested scrolling list to the list', () => {
    const sheet = createSheet();
    const list = document.createElement('ul');
    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 600 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 180 });
    const item = document.createElement('li');
    list.append(item);
    sheet.target('content').append(list);
    const gestures = attach(sheet, 'full', 0);

    // Pulling down at the top of the sheet content, inside the list: the list scrolls, not the sheet.
    touchEvent('touchstart', item, 300);
    const down = touchEvent('touchmove', item, 380);
    touchEvent('touchend', item);

    gestures.setSnap('peek');
    touchEvent('touchstart', item, 300);
    const up = touchEvent('touchmove', item, 220);
    touchEvent('touchend', item);

    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });

  it('still lets a list that does not overflow move the sheet', () => {
    const sheet = createSheet();
    const list = document.createElement('ul');
    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 180 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 180 });
    const item = document.createElement('li');
    list.append(item);
    sheet.target('content').append(list);
    const gestures = attach(sheet, 'peek', 200);

    touchEvent('touchstart', item, 300);
    const up = touchEvent('touchmove', item, 220);
    touchEvent('touchend', item);

    expect(up.defaultPrevented).toBe(true);
    gestures.detach();
  });

  it("still moves the sheet when the browser won't let a move be cancelled", () => {
    // Chrome Android sends non-cancelable touchmoves once a native scroll has started, which is
    // exactly when a full-screen scroll hands over at the top.
    const sheet = createSheet();
    const gestures = attach(sheet, 'peek', 200);

    touchEvent('touchstart', sheet.target('content'), 400);
    const move = new Event('touchmove', { bubbles: true, cancelable: false }) as TouchEvent;
    Object.defineProperty(move, 'touches', { value: [{ clientX: 20, clientY: 300, identifier: 1 }] });
    expect(() => sheet.target('content').dispatchEvent(move)).not.toThrow();
    touchEvent('touchend', sheet.target('content'));

    expect(move.defaultPrevented).toBe(false);
    expect(gestures.getTop()).toBe(100);
    expect(gestures.onDragEnd).toHaveBeenCalledWith(100, expect.any(Number));
    gestures.detach();
  });

  it('never hands a horizontal swipe to the sheet', () => {
    const sheet = createSheet();
    const gestures = attach(sheet, 'full', 0);

    touchEvent('touchstart', sheet.target('content'), 300, 20);
    touchEvent('touchmove', sheet.target('content'), 302, 60);
    const move = touchEvent('touchmove', sheet.target('content'), 330, 80);
    touchEvent('touchend', sheet.target('content'));

    expect(move.defaultPrevented).toBe(false);
    expect(gestures.onDragEnd).not.toHaveBeenCalled();
    gestures.detach();
  });
});
