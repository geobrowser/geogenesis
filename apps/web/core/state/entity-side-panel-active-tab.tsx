'use client';

import * as React from 'react';

import { validateEntityId } from '~/core/utils/utils';

export type EntitySidePanelActiveTabContextValue = {
  activeTabId: string | null;
  activeSystemTab: string | null;
  setActiveTabId: (tabId: string | null) => void;
  setActiveSystemTab: (tab: string) => void;
};

export const EntitySidePanelActiveTabContext = React.createContext<EntitySidePanelActiveTabContextValue | null>(null);

export function EntitySidePanelActiveTabProvider({
  entityId,
  children,
}: {
  entityId: string;
  children: React.ReactNode;
}) {
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const [activeSystemTab, setActiveSystemTab] = React.useState<string | null>(null);

  React.useEffect(() => {
    setActiveTabId(null);
    setActiveSystemTab(null);
  }, [entityId]);

  const setActiveTabIdValidated = React.useCallback((tabId: string | null) => {
    if (tabId !== null && !validateEntityId(tabId)) return;
    setActiveTabId(tabId);
    setActiveSystemTab(null);
  }, []);

  const selectSystemTab = React.useCallback((tab: string) => {
    setActiveTabId(null);
    setActiveSystemTab(tab);
  }, []);

  const value = React.useMemo(
    () => ({
      activeTabId,
      activeSystemTab,
      setActiveTabId: setActiveTabIdValidated,
      setActiveSystemTab: selectSystemTab,
    }),
    [activeSystemTab, activeTabId, selectSystemTab, setActiveTabIdValidated]
  );

  return <EntitySidePanelActiveTabContext.Provider value={value}>{children}</EntitySidePanelActiveTabContext.Provider>;
}

export function useEntitySidePanelActiveTab() {
  return React.useContext(EntitySidePanelActiveTabContext);
}
