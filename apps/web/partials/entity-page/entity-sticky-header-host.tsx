'use client';

import * as React from 'react';

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
 */
export function EntityStickyHeaderHost() {
  const setHost = useSetAtom(entityStickyHeaderHostElementAtom);

  const ref = React.useCallback(
    (element: HTMLDivElement | null) => {
      setHost(element);
    },
    [setHost]
  );

  return <div ref={ref} data-testid="entity-sticky-header-host" className="sticky top-11 z-40 h-0" />;
}
