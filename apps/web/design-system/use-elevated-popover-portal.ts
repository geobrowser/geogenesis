'use client';

import * as React from 'react';

/** Portal target appended to `document.body` so Radix popovers sit above the entity side panel (`z-[200]`). */
export function useElevatedPopoverPortal() {
  const [portalContainer, setPortalContainer] = React.useState<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    const el = document.createElement('div');
    el.className = 'elevated-popover';
    document.body.appendChild(el);
    setPortalContainer(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  return portalContainer;
}
