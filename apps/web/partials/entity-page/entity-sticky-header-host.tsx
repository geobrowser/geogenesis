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
 */
export function EntityStickyHeaderHost() {
  const setHost = useSetAtom(entityStickyHeaderHostElementAtom);

  const ref = React.useCallback(
    (element: HTMLDivElement | null) => {
      setHost(element);
    },
    [setHost]
  );

  return <div ref={ref} className="sticky top-11 z-50 h-0" />;
}
