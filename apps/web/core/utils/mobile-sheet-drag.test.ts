import { describe, expect, it } from 'vitest';

import {
  lockMobileSheetDocumentOverscroll,
  preventMobileSheetPullToRefresh,
  shouldStartMobileSheetDrag,
} from './mobile-sheet-drag';

function createSheet(scrollTop = 0) {
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-testid="backdrop"></div>
    <section data-mobile-sheet-surface>
      <div data-mobile-sheet-drag-handle><span data-testid="handle-child"></span></div>
      <header><span data-testid="header"></span><button data-testid="button">Open</button></header>
      <main data-mobile-sheet-scroll>
        <span data-testid="content"></span>
        <a data-testid="link" href="#">Entity</a>
      </main>
    </section>
  `;

  const scrollEl = root.querySelector<HTMLElement>('[data-mobile-sheet-scroll]');
  if (!scrollEl) throw new Error('Missing test scroll surface');
  Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: scrollTop });

  const target = (testId: string) => {
    const element = root.querySelector(`[data-testid="${testId}"]`);
    if (!element) throw new Error(`Missing test target: ${testId}`);
    return element;
  };

  return { root, target };
}

describe('shouldStartMobileSheetDrag', () => {
  it('starts from non-interactive content or chrome when the sheet content is at the top', () => {
    const { root, target } = createSheet();

    expect(shouldStartMobileSheetDrag(target('content'), root)).toBe(true);
    expect(shouldStartMobileSheetDrag(target('header'), root)).toBe(true);
  });

  it('reserves non-handle downward gestures for scrolling when content is away from the top', () => {
    const { root, target } = createSheet(24);

    expect(shouldStartMobileSheetDrag(target('content'), root)).toBe(false);
    expect(shouldStartMobileSheetDrag(target('header'), root)).toBe(false);
  });

  it('always starts from the grab handle, including its descendants', () => {
    const { root, target } = createSheet(24);

    expect(shouldStartMobileSheetDrag(target('handle-child'), root)).toBe(true);
  });

  it('leaves taps and gestures on interactive controls alone', () => {
    const { root, target } = createSheet();

    expect(shouldStartMobileSheetDrag(target('button'), root)).toBe(false);
    expect(shouldStartMobileSheetDrag(target('link'), root)).toBe(false);
  });

  it('does not start a sheet drag from the backdrop', () => {
    const { root, target } = createSheet();

    expect(shouldStartMobileSheetDrag(target('backdrop'), root)).toBe(false);
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

function touchEvent(
  type: 'touchstart' | 'touchmove',
  target: Element,
  { clientX, clientY }: { clientX: number; clientY: number }
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', {
    value: [{ clientX, clientY, identifier: 1, target }],
  });
  target.dispatchEvent(event);
  return event;
}

describe('preventMobileSheetPullToRefresh', () => {
  it('prevents a downward browser gesture when an eligible sheet drag begins', () => {
    const { root, target } = createSheet();
    const removeGuard = preventMobileSheetPullToRefresh(root);

    touchEvent('touchstart', target('content'), { clientX: 20, clientY: 20 });
    const move = touchEvent('touchmove', target('content'), { clientX: 20, clientY: 40 });

    expect(move.defaultPrevented).toBe(true);
    removeGuard();
  });

  it('prevents a handle drag even when the sheet content is scrolled', () => {
    const { root, target } = createSheet(24);
    const removeGuard = preventMobileSheetPullToRefresh(root);

    touchEvent('touchstart', target('handle-child'), { clientX: 20, clientY: 20 });
    const move = touchEvent('touchmove', target('handle-child'), { clientX: 20, clientY: 40 });

    expect(move.defaultPrevented).toBe(true);
    removeGuard();
  });

  it('leaves upward, horizontal, and scrolled-content gestures native', () => {
    const topSheet = createSheet();
    const removeTopGuard = preventMobileSheetPullToRefresh(topSheet.root);
    touchEvent('touchstart', topSheet.target('content'), { clientX: 20, clientY: 40 });
    const upwardMove = touchEvent('touchmove', topSheet.target('content'), { clientX: 20, clientY: 20 });

    const horizontalSheet = createSheet();
    const removeHorizontalGuard = preventMobileSheetPullToRefresh(horizontalSheet.root);
    touchEvent('touchstart', horizontalSheet.target('content'), { clientX: 20, clientY: 20 });
    const horizontalMove = touchEvent('touchmove', horizontalSheet.target('content'), {
      clientX: 40,
      clientY: 20,
    });

    const scrolledSheet = createSheet(24);
    const removeScrolledGuard = preventMobileSheetPullToRefresh(scrolledSheet.root);
    touchEvent('touchstart', scrolledSheet.target('content'), { clientX: 20, clientY: 20 });
    const scrolledMove = touchEvent('touchmove', scrolledSheet.target('content'), {
      clientX: 20,
      clientY: 40,
    });

    expect(upwardMove.defaultPrevented).toBe(false);
    expect(horizontalMove.defaultPrevented).toBe(false);
    expect(scrolledMove.defaultPrevented).toBe(false);
    removeTopGuard();
    removeHorizontalGuard();
    removeScrolledGuard();
  });
});
