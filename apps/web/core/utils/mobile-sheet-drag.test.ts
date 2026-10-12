import { describe, expect, it, vi } from 'vitest';

import {
  type MobileSheetSnap,
  attachMobileSheetGestures,
  canStartMobileSheetGesture,
  lockMobileSheetDocumentOverscroll,
  resolveMobileSheetRelease,
  shouldClaimMobileSheetGesture,
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

function touchEvent(type: 'touchstart' | 'touchmove' | 'touchend', target: Element, clientY?: number, clientX = 20) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: clientY === undefined ? [] : [{ clientX, clientY, identifier: 1, target }],
  });
  target.dispatchEvent(event);
  return event;
}

function attach(sheet: ReturnType<typeof createSheet>, initialSnap: MobileSheetSnap, initialTop: number) {
  let snap = initialSnap;
  let top = initialTop;
  const onDragEnd = vi.fn();
  const detach = attachMobileSheetGestures(sheet.root, {
    getSnap: () => snap,
    getTop: () => top,
    onDragStart: () => {},
    onDragMove: next => (top = next),
    onDragEnd,
  });
  return { detach, onDragEnd, getTop: () => top, setSnap: (next: MobileSheetSnap) => (snap = next) };
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
