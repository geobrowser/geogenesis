import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMirroredContentColumn } from './use-mirrored-content-column';

const ATTRIBUTE = 'data-entity-page-content';

/**
 * jsdom lays nothing out, so every box in this file is stated rather than measured.
 *
 * Spelled out field by field rather than spread from a `DOMRect`: its properties are prototype
 * accessors, so a spread copies none of them and every measurement comes back `NaN`.
 */
function withBox<T extends Element>(element: T, box: { left: number; width: number }): T {
  const rect: DOMRect = {
    x: box.left,
    y: 0,
    left: box.left,
    right: box.left + box.width,
    top: 0,
    bottom: 40,
    width: box.width,
    height: 40,
    toJSON: () => ({}),
  };
  element.getBoundingClientRect = () => rect;
  return element;
}

/**
 * A host, a tagged column with padding, and an anchor inside the column — the shape the sticky
 * header sees: it is portalled into the host and tracks the page's title.
 */
function buildPage({
  host: hostBox = { left: 200, width: 1240 },
  column: columnBox = { left: 400, width: 840 },
  padding = '20px',
  tagColumn = true,
}: {
  host?: { left: number; width: number };
  column?: { left: number; width: number };
  padding?: string;
  tagColumn?: boolean;
} = {}) {
  const host = withBox(document.createElement('div'), hostBox);
  const column = withBox(document.createElement('div'), columnBox);
  if (tagColumn) column.setAttribute(ATTRIBUTE, '');
  column.style.paddingLeft = padding;
  column.style.paddingRight = padding;

  const anchor = document.createElement('h1');
  column.append(anchor);
  document.body.append(host, column);

  return { host, column, anchor };
}

beforeEach(() => {
  // Observed but never fired: these cases are about the first measurement.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('useMirroredContentColumn', () => {
  it('reports the column’s content box in the host’s coordinates', () => {
    const { host, anchor } = buildPage();

    const { result } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));

    // Column at 400 with 20px of padding, host starting at 200: text starts 220 into the host and
    // runs for the 800 the padding leaves.
    expect(result.current).toEqual({ left: 220, width: 800 });
  });

  /**
   * The gutters are the page's, not the bar's. Mirroring the border box would put the bar's text a
   * gutter outside the text it lines up with, and then the bar's own padding would double it.
   */
  it('takes the column’s own padding off rather than passing it on', () => {
    const { host, anchor } = buildPage({ padding: '0px' });

    const { result } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));

    expect(result.current).toEqual({ left: 200, width: 840 });
  });

  it('follows whichever column the anchor is in, so a narrower view is matched', () => {
    const { host, anchor } = buildPage({ column: { left: 460, width: 720 }, padding: '16px' });

    const { result } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));

    expect(result.current).toEqual({ left: 276, width: 688 });
  });

  /**
   * The nearest tagged ancestor, not the first in the document: a side panel open over the page has
   * a column of its own, and a document query would be a coin toss between them.
   */
  it('reads the column the anchor sits in and ignores others', () => {
    const { host, anchor } = buildPage({ column: { left: 400, width: 840 }, padding: '20px' });
    const otherColumn = withBox(document.createElement('div'), { left: 0, width: 300 });
    otherColumn.setAttribute(ATTRIBUTE, '');
    document.body.prepend(otherColumn);

    const { result } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));

    expect(result.current).toEqual({ left: 220, width: 800 });
  });

  it('reports nothing when the anchor is in no tagged column', () => {
    const { host, anchor } = buildPage({ tagColumn: false });

    const { result } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));

    expect(result.current).toBeNull();
  });

  it('reports nothing without an anchor or a host', () => {
    const { host, anchor } = buildPage();

    expect(renderHook(() => useMirroredContentColumn(null, host, ATTRIBUTE)).result.current).toBeNull();
    expect(renderHook(() => useMirroredContentColumn(anchor, null, ATTRIBUTE)).result.current).toBeNull();
  });

  it('measures once and then watches both the column and the host', () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(element: Element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect() {}
      }
    );

    const { host, column, anchor } = buildPage();
    renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));

    // The host too: collapsing the browse sidebar widens the column under a bar that has not
    // otherwise changed.
    expect(observed).toEqual([column, host]);
  });

  /**
   * The whole point of the observer. A column's width is not fixed for the life of the page — it
   * changes when the window resizes, when a rail appears beside it, and whenever somebody edits the
   * constant it is set from — and none of those re-render the caller.
   */
  it('re-measures when the column changes size', () => {
    let fire = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          fire = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );

    const { host, column, anchor } = buildPage();
    const { result, rerender } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));
    expect(result.current).toEqual({ left: 220, width: 800 });

    withBox(column, { left: 300, width: 1040 });
    act(() => fire());
    rerender();

    expect(result.current).toEqual({ left: 120, width: 1000 });
  });

  /**
   * The host is watched as well as the column, for the case the column alone would miss: a column at
   * its max width does not resize when the window does, it only moves.
   */
  it('re-measures when the host moves under an unchanged column', () => {
    let fire = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          fire = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );

    const { host, anchor } = buildPage();
    const { result, rerender } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));
    expect(result.current).toEqual({ left: 220, width: 800 });

    withBox(host, { left: 24, width: 1416 });
    act(() => fire());
    rerender();

    expect(result.current).toEqual({ left: 396, width: 800 });
  });

  it('still measures where ResizeObserver is missing', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { host, anchor } = buildPage();

    const { result } = renderHook(() => useMirroredContentColumn(anchor, host, ATTRIBUTE));

    expect(result.current).toEqual({ left: 220, width: 800 });
  });
});
