'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname } from 'next/navigation';

import { debateFeedPanelAtom, exploreDebateClaimsPanelAtom } from '~/atoms';

/**
 * Closes the panels that are held in atoms purely to share the one right-hand slot, when the reader
 * leaves the page.
 *
 * Both of these used to be `useState` on the surface that drew them.
 *
 * Mounted app-level rather than on those surfaces, because the surface is exactly what navigation
 * unmounts.
 *
 * It deliberately leaves those two alone. Each already does this for itself, and the side panel's
 * version carries an exception for the create-post flow that a second clearer would quietly
 * override.
 */
export function EntityPanelSlotReset() {
  const closeExploreDebateClaims = useSetAtom(exploreDebateClaimsPanelAtom);
  const closeDebateFeedPanel = useSetAtom(debateFeedPanelAtom);
  const pathname = usePathname();
  const lastPathnameRef = React.useRef(pathname);

  React.useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    closeExploreDebateClaims(null);
    closeDebateFeedPanel(null);
  }, [closeDebateFeedPanel, closeExploreDebateClaims, pathname]);

  return null;
}
