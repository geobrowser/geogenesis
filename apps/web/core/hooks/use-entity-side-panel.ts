'use client';

import { useAtom } from 'jotai';

import { entitySidePanelAtom } from '~/atoms';

export function useEntitySidePanel() {
  const [target, setTarget] = useAtom(entitySidePanelAtom);

  const openSidePanel = (entityId: string, entitySpaceId: string, openedWithMainViewEditing: boolean) =>
    setTarget({ entityId, spaceId: entitySpaceId, openedWithMainViewEditing });

  const closeSidePanel = () => setTarget(null);

  return {
    sidePanelTarget: target,
    openSidePanel,
    closeSidePanel,
  };
}
