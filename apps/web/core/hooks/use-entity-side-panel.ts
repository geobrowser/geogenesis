'use client';
import { useAtom } from 'jotai';

import { snapshotActionContext } from '~/core/action-context';

import { type EntitySidePanelTarget, entitySidePanelAtom } from '~/atoms';

export type OpenSidePanelOptions = Pick<EntitySidePanelTarget, 'openedFromReviewEdits' | 'forceRequestedSpace'>;

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
      analyticsContext: snapshotActionContext('entity_vote_buttons', 'entity', entityId),
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
