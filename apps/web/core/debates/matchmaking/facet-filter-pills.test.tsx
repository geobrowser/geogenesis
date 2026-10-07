import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FacetFilterPills, type FacetPillOption, fitPills } from './facet-filter-pills';

const topics = (n: number): FacetPillOption[] =>
  Array.from({ length: n }, (_, index) => ({
    kind: 'topic',
    id: `t${index}`,
    name: `Topic ${index}`,
    count: n - index,
  }));

const space = (id: string, name: string | null, count: number): FacetPillOption => ({
  kind: 'space',
  id,
  name,
  image: null,
  count,
});

function renderPills(props: Partial<React.ComponentProps<typeof FacetFilterPills>> = {}) {
  const onToggle = vi.fn();
  const onClear = vi.fn();
  render(
    <FacetFilterPills
      analyticsSurface="rematch"
      options={topics(3)}
      pickedIds={[]}
      onToggle={onToggle}
      onClear={onClear}
      {...props}
    />
  );
  return { onToggle, onClear };
}

const row = () => screen.getByRole('group', { name: 'Filter claims' });

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
    // 100px pills with 8px gaps: three to a 320px line. All + 5 pills fill two lines exactly, so
    // with "…" to fit as well, one pill has to go.
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

describe('FacetFilterPills', () => {
  it('draws All and a pill per option, with no "…" when everything fits', () => {
    renderPills();

    expect(within(row()).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(row()).getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /All filters/ })).toBeNull();
  });

  it('draws spaces and topics in one row', () => {
    renderPills({ options: [space('s1', 'Crypto', 5), ...topics(2)] });

    expect(within(row()).getByRole('button', { name: /Crypto/ })).toBeInTheDocument();
    expect(within(row()).getByRole('button', { name: /Topic 0/ })).toBeInTheDocument();
  });

  it('hands back the option pressed, and clears everything from All', () => {
    const crypto = space('s1', 'Crypto', 5);
    const { onToggle, onClear } = renderPills({ options: [crypto, ...topics(2)], pickedIds: ['t1'] });

    fireEvent.click(within(row()).getByRole('button', { name: /Crypto/ }));
    expect(onToggle).toHaveBeenCalledWith(crypto);
    expect(within(row()).getByRole('button', { name: /Topic 1/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(row()).getByRole('button', { name: 'All' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('draws a skeleton for a space whose name has not arrived', () => {
    renderPills({ options: [space('s1', null, 5)] });

    expect(within(row()).getByLabelText('Loading space name')).toBeInTheDocument();
  });

  it('fits two lines and puts the rest behind "…"', () => {
    layOut({ pill: 100, row: 320 });
    renderPills({ options: topics(10) });

    // All, four pills and "…" fill two lines of three.
    expect(within(row()).getAllByRole('button', { name: /^Topic/ })).toHaveLength(4);
    expect(within(row()).getByRole('button', { name: 'All filters (10)' })).toBeInTheDocument();
  });

  it('opens every option from "…", and picks from there', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    layOut({ pill: 100, row: 320 });
    const options = topics(10);
    const { onToggle } = renderPills({ options });

    fireEvent.click(within(row()).getByRole('button', { name: 'All filters (10)' }));
    fireEvent.click(screen.getByRole('button', { name: /Topic 9/ }));

    expect(onToggle).toHaveBeenCalledWith(options[9]);
  });

  it('always draws every picked option, however full the row is', () => {
    layOut({ pill: 300, row: 320 });
    renderPills({ options: topics(6), pickedIds: ['t0', 't1', 't2'] });

    expect(within(row()).getAllByRole('button', { name: /^Topic/ })).toHaveLength(3);
  });
});
