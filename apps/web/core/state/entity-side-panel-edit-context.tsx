'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { entitySidePanelWantsEditAtom } from '~/atoms';
import { useAccessControl } from '~/core/hooks/use-access-control';

export type EntitySidePanelEditContextValue = {
  spaceId: string;
  panelWantsEdit: boolean;
  setPanelWantsEdit: React.Dispatch<React.SetStateAction<boolean>>;
};

export const EntitySidePanelEditContext = React.createContext<EntitySidePanelEditContextValue | null>(null);

export function EntitySidePanelEditModeProvider({
  entitySpaceId,
  openedWithMainViewEditing,
  children,
}: {
  entitySpaceId: string;
  openedWithMainViewEditing: boolean;
  children: React.ReactNode;
}) {
  const [panelWantsEdit, setPanelWantsEdit] = React.useState(openedWithMainViewEditing);
  const setGlobalPanelWantsEdit = useSetAtom(entitySidePanelWantsEditAtom);
  const { canEdit, isLoading } = useAccessControl(entitySpaceId);

  React.useEffect(() => {
    setGlobalPanelWantsEdit(panelWantsEdit);
    return () => setGlobalPanelWantsEdit(false);
  }, [panelWantsEdit, setGlobalPanelWantsEdit]);

  React.useEffect(() => {
    setPanelWantsEdit(openedWithMainViewEditing);
  }, [entitySpaceId, openedWithMainViewEditing]);

  React.useEffect(() => {
    if (!isLoading && !canEdit) {
      setPanelWantsEdit(false);
    }
  }, [canEdit, isLoading]);

  const value = React.useMemo(
    () => ({
      spaceId: entitySpaceId,
      panelWantsEdit,
      setPanelWantsEdit,
    }),
    [entitySpaceId, panelWantsEdit]
  );

  return <EntitySidePanelEditContext.Provider value={value}>{children}</EntitySidePanelEditContext.Provider>;
}
