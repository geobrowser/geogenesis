'use client';

import * as React from 'react';

export type ContentColumnBox = {
  /** Offset from `host`'s left edge to where the column's content starts. */
  left: number;
  /** The column's content width, its own horizontal padding already taken off. */
  width: number;
};

function measure(content: Element, host: Element): ContentColumnBox | null {
  const contentRect = content.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();

  // A detached or hidden column measures all zeros, which is not a width — it is an absence, and
  // reporting it as `{ left: -hostLeft, width: 0 }` would have the caller draw a blank strip rather
  // than fall back to a width of its own.
  if (contentRect.width === 0) return null;

  // The *content* box, not the border box. Every page but the generic one pads its column
  // (`px-4`/`px-5`), and mirroring the border box would put the bar's text a gutter's width outside
  // the text it is supposed to line up with — then the bar's own padding would double it.
  const styles = getComputedStyle(content);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;

  return {
    left: contentRect.left + paddingLeft - hostRect.left,
    width: Math.max(0, contentRect.width - paddingLeft - paddingRight),
  };
}

/**
 * Where a page's content column sits, in `host`'s coordinates.
 *
 * For lining a fixed or portalled element up with a column it is not inside. There is no width to
 * hard-code: the generic entity page is 900 and unpadded, a claim 840 at `px-4`/`px-5`, a topic 720,
 * a page with a rail 1142 — and a view added later will have its own. Reading the column the caller
 * is actually tracking means a new one is matched by tagging it, with nothing to keep in sync here.
 *
 * `anchor` is any element inside that column; the column itself is the nearest ancestor carrying
 * `attribute`. Anchoring rather than querying the document keeps the answer unambiguous when a side
 * panel is open over the page with a column of its own.
 *
 * Returns null when there is nothing to mirror, which is the caller's cue to fall back to a width of
 * its own rather than collapse to zero.
 *
 * Measured in a layout effect, which is the one place it can be measured. It cannot be derived during
 * render — the DOM this reads is the DOM being rendered, so the element is not committed yet and
 * `closest` would walk the previous tree. A passive effect is the other way to get it wrong: it runs
 * after the browser paints, so the commit that first sees a new anchor paints with the *previous*
 * column's geometry, or with the caller's fallback width when a title mounts late. That is the wrong
 * width on screen for a frame — a different and worse thing than a decoration arriving a frame late,
 * which is why `useScrolledPastElement` is content to stay passive and this is not.
 */
export function useMirroredContentColumn(
  anchor: Element | null,
  host: Element | null,
  attribute: string
): ContentColumnBox | null {
  const [box, setBox] = React.useState<ContentColumnBox | null>(null);

  React.useLayoutEffect(() => {
    if (!anchor || !host) {
      setBox(null);
      return;
    }

    const content = anchor.closest(`[${attribute}]`);
    if (!content) {
      setBox(null);
      return;
    }

    const sync = () => {
      const next = measure(content, host);
      // Compared before storing: a `ResizeObserver` fires for changes on both axes, and a bar that
      // re-rendered every time the page below it grew a row would be paying for nothing — the
      // horizontal geometry is all this reports.
      setBox(previous =>
        previous && next && previous.left === next.left && previous.width === next.width ? previous : next
      );
    };

    sync();

    if (typeof ResizeObserver === 'undefined') return;

    // Both: the column moves when the window resizes, and also when the host does — collapsing the
    // browse sidebar widens the column under a bar that has not otherwise changed.
    const observer = new ResizeObserver(sync);
    observer.observe(content);
    observer.observe(host);

    return () => observer.disconnect();
  }, [anchor, host, attribute]);

  return box;
}
