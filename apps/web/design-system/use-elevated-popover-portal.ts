'use client';

import * as React from 'react';

import { EntitySidePanelPopoverPortalContext } from '~/core/state/entity-side-panel-popover-portal';

export function useElevatedPopoverPortal() {
  const sidePanelPortal = React.useContext(EntitySidePanelPopoverPortalContext);
  const [bodyPortal, setBodyPortal] = React.useState<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (sidePanelPortal) {
      return;
    }

    const el = document.createElement('div');
    el.className = 'elevated-popover';
    document.body.appendChild(el);
    setBodyPortal(el);

    return () => {
      document.body.removeChild(el);
      setBodyPortal(null);
    };
  }, [sidePanelPortal]);

  return sidePanelPortal ?? bodyPortal;
}
