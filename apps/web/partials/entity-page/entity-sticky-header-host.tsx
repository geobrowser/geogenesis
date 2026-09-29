'use client';

import * as React from 'react';

import cx from 'classnames';
import { useSetAtom } from 'jotai';

import { entityStickyHeaderHostElementAtom } from '~/atoms';

/** The navbar's height (`h-11`), which the bar docks directly beneath. */
export const APP_NAVBAR_HEIGHT = 44;

/**
 * The slot the sticky entity header portals into, mounted once by the app shell.
 *
 * Zero-height and stuck at the navbar's lower edge, with the bar itself positioned absolutely
 * inside it. Height has to stay at zero: this sits in the content column's normal flow, so any
 * height it took would push the page down the moment the bar appeared, which is exactly the jolt a
 * sticky header is supposed to avoid.
 *
 * `z-40` puts it between the page (auto) and the browse sidebar (`z-50`), under the navbar
 * (`z-60`). The sidebar's collapse toggle hangs off the sidebar's right edge and overlaps this
 * column, and the `z-[60]` on the button itself cannot lift it out of the sidebar's own stacking
 * context — so the bar has to sit below `z-50` or it covers the toggle, which at 52px from the top
 * is squarely in the bar's band. Matching the sidebar at 50 is not enough: this element comes later
 * in the DOM, so an equal layer still wins.
 *
 * @param railInset - the collapsed sidebar is drawing its vertical rail across this column, so start
 * to the right of it. The rail sits 24px in and the aside holding it is zero-width, so without this
 * the bar's background and bottom border run out past the rail and cut it — the one line saying
 * where the sidebar still is. An expanded sidebar needs nothing: it has real width and its own
 * `border-r`, and the column already begins after both.
 */
export function EntityStickyHeaderHost({ railInset = false }: { railInset?: boolean }) {
  const setHost = useSetAtom(entityStickyHeaderHostElementAtom);

  const ref = React.useCallback(
    (element: HTMLDivElement | null) => {
      setHost(element);
    },
    [setHost]
  );

  return (
    <div
      ref={ref}
      data-testid="entity-sticky-header-host"
      // `ml-6` lands the left edge on the rail itself, which draws over it from `z-50`, so the bar
      // reads as starting the pixel after. No rail below the `mobile` breakpoint — the whole sidebar
      // is hidden there — so the bar goes back to full width.
      className={cx('sticky top-11 z-40 h-0', railInset && 'ml-6 mobile:ml-0')}
    />
  );
}
