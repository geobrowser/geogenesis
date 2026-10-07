import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopicFilterPills, fitPills } from './topic-filter-pills';

const topics = (n: number) =>
  Array.from({ length: n }, (_, index) => ({ id: `t${index}`, name: `Topic ${index}`, count: n - index }));

function renderPills(props: Partial<React.ComponentProps<typeof TopicFilterPills>> = {}) {
  const onTopicToggle = vi.fn();
  const onTopicsClear = vi.fn();
  render(
    <TopicFilterPills
      analyticsSurface="rematch"
      topics={topics(3)}
      topicIds={[]}
      onTopicToggle={onTopicToggle}
      onTopicsClear={onTopicsClear}
      {...props}
    />
  );
  return { onTopicToggle, onTopicsClear };
}

const row = () => screen.getByRole('group', { name: 'Filter by topic' });

/**
 * jsdom lays nothing out, so every width reads zero and every pill fits. This gives each pill a
 * width and the row a width, so the two-line fit has something to fit.
 */
function layOut({ pill, row: rowWidth }: { pill: number; row: number }) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({ width: pill, height: 28, top: 0, left: 0, right: pill, bottom: 28, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(rowWidth);
}

/** The menu's popover measures itself, and jsdom has no ResizeObserver to do it with. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fitPills', () => {
  it('keeps every pill when they all fit on two lines', () => {
    expect(fitPills({ leading: 50, widths: [50, 50, 50], trailing: 30, available: 400, lines: 2 })).toBe(3);
  });

  it('stops at two lines, leaving room for the trailing control', () => {
    // 100px pills with 8px gaps: three to a 320px line. All topics + 5 pills fill two lines exactly,
    // so with "…" to fit as well, one pill has to go.
    expect(
      fitPills({ leading: 100, widths: [100, 100, 100, 100, 100, 100], trailing: 36, available: 320, lines: 2 })
    ).toBe(4);
  });

  it('never drops below the forced count', () => {
    expect(fitPills({ leading: 300, widths: [300, 300, 300], trailing: 36, available: 320, lines: 2, forced: 3 })).toBe(
      3
    );
  });
});

describe('TopicFilterPills', () => {
  it('draws All topics and a pill per topic, with no "…" when everything fits', () => {
    renderPills();

    expect(within(row()).getByRole('button', { name: 'All topics' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(row()).getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /All topics \(/ })).toBeNull();
  });

  it('toggles a topic from its pill, and clears from All topics', () => {
    const { onTopicToggle, onTopicsClear } = renderPills({ topicIds: ['t1'] });

    fireEvent.click(within(row()).getByRole('button', { name: /Topic 0/ }));
    expect(onTopicToggle).toHaveBeenCalledWith('t0');
    expect(within(row()).getByRole('button', { name: /Topic 1/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(row()).getByRole('button', { name: 'All topics' }));
    expect(onTopicsClear).toHaveBeenCalled();
  });

  it('fits two lines and puts the rest behind "…"', () => {
    layOut({ pill: 100, row: 320 });
    renderPills({ topics: topics(10) });

    // All topics, four topics and "…" fill two lines of three.
    expect(within(row()).getAllByRole('button', { name: /^Topic/ })).toHaveLength(4);
    expect(within(row()).getByRole('button', { name: 'All topics (10)' })).toBeInTheDocument();
  });

  it('opens every topic from "…", and picks from there', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    layOut({ pill: 100, row: 320 });
    const { onTopicToggle } = renderPills({ topics: topics(10) });

    fireEvent.click(within(row()).getByRole('button', { name: 'All topics (10)' }));
    fireEvent.click(screen.getByRole('button', { name: /Topic 9/ }));

    expect(onTopicToggle).toHaveBeenCalledWith('t9');
  });

  it('always draws every picked topic, however full the row is', () => {
    layOut({ pill: 300, row: 320 });
    renderPills({ topics: topics(6), topicIds: ['t0', 't1', 't2'] });

    expect(within(row()).getAllByRole('button', { name: /^Topic/ })).toHaveLength(3);
  });
});
