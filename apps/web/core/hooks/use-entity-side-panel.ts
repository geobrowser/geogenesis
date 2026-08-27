'use client';

import { useAtom } from 'jotai';

import { type EntitySidePanelTarget, entitySidePanelAtom } from '~/atoms';

export type OpenSidePanelOptions = Pick<EntitySidePanelTarget, 'openedFromReviewEdits'>;

export function useEntitySidePanel() {
  const [target, setTarget] = useAtom(entitySidePanelAtom);

  const openSidePanel = (
    entityId: string,
    entitySpaceId: string,
    openedWithMainViewEditing: boolean,
    options?: OpenSidePanelOptions
  ) =>
    setTarget({
      entityId,
      spaceId: entitySpaceId,
      openedWithMainViewEditing,
      ...options,
    });

  const closeSidePanel = () => setTarget(null);

  return {
    sidePanelTarget: target,
    openSidePanel,
    closeSidePanel,
  };
}
