import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollableTabRow } from './scrollable-tab-row';

/**
 * jsdom has no layout, so the row's geometry is stubbed: a 300px scroller over a 700px row of seven
 * 100px tabs, the n-th starting at n * 100.
 */
const VIEW = 300;
const ROW = 700;

let view = VIEW;
let scrollLeft = 0;

/** Every `ResizeObserver` the row and its hook create, so a test can report a size change. */
const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];

class StubResizeObserver {
  private entry: { callback: ResizeObserverCallback; targets: Element[] };
  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback, targets: [] };
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.entry.targets = [];
  }
}

/** Reports a resize to every observer watching `target`, as the browser would. */
function resize(target: Element) {
  for (const { callback, targets } of observers) {
    if (targets.includes(target)) callback([], {} as ResizeObserver);
  }
}
const scrollTo = vi.fn((options: ScrollToOptions) => {
  scrollLeft = options.left ?? scrollLeft;
});

function isScroller(element: Element) {
  return element.classList.contains('overflow-x-auto');
}

beforeEach(() => {
  view = VIEW;
  scrollLeft = 0;
  observers.length = 0;
  scrollTo.mockClear();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? view : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? ROW : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? scrollLeft : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.dataset.index ?? 0) * 100;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
  (HTMLElement.prototype as { scrollTo: unknown }).scrollTo = scrollTo;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Row({ active }: { active: number }) {
  return (
    <ScrollableTabRow activeKey={String(active)} analyticsLabelPrefix="Test">
      {Array.from({ length: 7 }, (_, index) => (
        <button key={index} type="button" data-index={index} data-tab-active={index === active ? 'true' : undefined}>
          Tab {index}
        </button>
      ))}
    </ScrollableTabRow>
  );
}

describe('ScrollableTabRow', () => {
  it('says there are more tabs past the end, and none before the start', () => {
    render(<Row active={0} />);

    expect(screen.getByRole('button', { name: 'Show more tabs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show earlier tabs' })).toBeNull();
  });

  it('scrolls a selected tab that starts off-screen fully into view, clear of the fade', () => {
    render(<Row active={5} />);

    // Tab 5 spans 500–600; its right edge plus the 40px clearance, less the 300px view.
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 340, behavior: 'smooth' });
  });

  it('leaves the row alone when the selected tab is already in view', () => {
    render(<Row active={1} />);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('moves most of a view per press of the arrow, and offers the way back once scrolled', () => {
    render(<Row active={0} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more tabs' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: VIEW * 0.7, behavior: 'smooth' });

    fireEvent.scroll(screen.getByRole('button', { name: 'Tab 0' }).closest('.overflow-x-auto')!);
    expect(screen.getByRole('button', { name: 'Show earlier tabs' })).toBeInTheDocument();
  });

  /**
   * A phone turned upright, or a window narrowed, can leave the selected tab clipped without the
   * selection changing. Only the row's own width counts: its content resizes whenever a count lands
   * in a badge, and re-aligning on that would pull the row back from under someone scrolling it.
   */
  it('brings the selected tab back into view when the row narrows, and only then', () => {
    render(<Row active={5} />);
    const scroller = screen.getByRole('button', { name: 'Tab 5' }).closest('.overflow-x-auto')!;
    expect(scrollLeft).toBe(340);
    scrollTo.mockClear();

    // The viewer scrolls back to the start, leaving tab 5 off-screen on purpose — and then the
    // content resizes (a count lands) while the row stays as wide as it was. They are not moved.
    scrollLeft = 0;
    fireEvent.scroll(scroller);
    resize(scroller.firstElementChild!);
    resize(scroller);
    expect(scrollTo).not.toHaveBeenCalled();

    // The row narrows to 200px, which clips tab 5's right edge.
    view = 200;
    resize(scroller);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 640 - 200, behavior: 'smooth' });
  });

  it('names its arrows for click analytics', () => {
    render(<Row active={0} />);

    expect(screen.getByRole('button', { name: 'Show more tabs' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Test scroll tabs right'
    );
  });
});
