'use client';

import * as React from 'react';

import { validateEntityId } from '~/core/utils/utils';

export type EntitySidePanelActiveTabContextValue = {
  activeTabId: string | null;
  setActiveTabId: (tabId: string | null) => void;
};

export const EntitySidePanelActiveTabContext = React.createContext<EntitySidePanelActiveTabContextValue | null>(
  null
);

export function EntitySidePanelActiveTabProvider({
  entityId,
  children,
}: {
  entityId: string;
  children: React.ReactNode;
}) {
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setActiveTabId(null);
  }, [entityId]);

  const setActiveTabIdValidated = React.useCallback((tabId: string | null) => {
    if (tabId !== null && !validateEntityId(tabId)) return;
    setActiveTabId(tabId);
  }, []);

  const value = React.useMemo(
    () => ({ activeTabId, setActiveTabId: setActiveTabIdValidated }),
    [activeTabId, setActiveTabIdValidated]
  );

  return <EntitySidePanelActiveTabContext.Provider value={value}>{children}</EntitySidePanelActiveTabContext.Provider>;
}

export function useEntitySidePanelActiveTab() {
  return React.useContext(EntitySidePanelActiveTabContext);
}
