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

let scrollLeft = 0;
const scrollTo = vi.fn((options: ScrollToOptions) => {
  scrollLeft = options.left ?? scrollLeft;
});

function isScroller(element: Element) {
  return element.classList.contains('overflow-x-auto');
}

beforeEach(() => {
  scrollLeft = 0;
  scrollTo.mockClear();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? VIEW : 0;
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

  it('names its arrows for click analytics', () => {
    render(<Row active={0} />);

    expect(screen.getByRole('button', { name: 'Show more tabs' })).toHaveAttribute(
      'data-geo-analytics-label',
      'Test scroll tabs right'
    );
  });
});
