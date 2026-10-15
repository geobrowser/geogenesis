'use client';

import * as React from 'react';

import { useStore } from 'jotai';

import { EntitySidePanelPopoverPortalContext } from '~/core/state/entity-side-panel-popover-portal';

import { slideUpPopoverContainerAtom } from '~/atoms';

/** An enclosing overlay can keep popovers within its focus, accessibility, and stacking boundary. */
export const ElevatedPopoverPortalContext = React.createContext<HTMLElement | null>(null);

export function useElevatedPopoverPortal() {
  const localPortal = React.useContext(ElevatedPopoverPortalContext);
  const sidePanelPortal = React.useContext(EntitySidePanelPopoverPortalContext);
  // Like RespondersPopover, read on the render that opens the menu rather than subscribing every
  // closed menu to sheet changes. The sheet's host is already exempt from its RemoveScroll lock.
  const store = useStore();
  const overlayPortal = localPortal ?? sidePanelPortal ?? store.get(slideUpPopoverContainerAtom);
  const [bodyPortal, setBodyPortal] = React.useState<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (overlayPortal) {
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
  }, [overlayPortal]);

  return overlayPortal ?? bodyPortal;
}
