'use client';

import * as React from 'react';

export const EntitySidePanelPopoverPortalContext = React.createContext<HTMLDivElement | null>(null);

export function EntitySidePanelPopoverPortalProvider({ children }: { children: React.ReactNode }) {
  const [portalEl, setPortalEl] = React.useState<HTMLDivElement | null>(null);

  return (
    <EntitySidePanelPopoverPortalContext.Provider value={portalEl}>
      {children}
      <div
        ref={setPortalEl}
        className="side-panel-elevated-popover pointer-events-none fixed inset-0 z-[60]"
        aria-hidden
      />
    </EntitySidePanelPopoverPortalContext.Provider>
  );
}
