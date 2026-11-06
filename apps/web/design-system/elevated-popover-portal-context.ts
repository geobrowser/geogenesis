'use client';

import * as React from 'react';

/**
 * An enclosing overlay can keep popovers within its focus, accessibility, and stacking boundary.
 *
 * Its own module, free of jotai, so an overlay can provide it without importing the atoms
 * `useElevatedPopoverPortal` reads (tests that mock jotai wholesale import those overlays).
 */
export const ElevatedPopoverPortalContext = React.createContext<HTMLElement | null>(null);
