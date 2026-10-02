'use client';

import { useAtomValue, useSetAtom } from 'jotai';

import { useActionContext } from '~/core/action-context-provider';

import { type EntitySidePanelTarget, entitySidePanelAtom, openEntitySidePanelAtom } from '~/atoms';

export type OpenSidePanelOptions = Pick<
  EntitySidePanelTarget,
  'openedFromReviewEdits' | 'forceRequestedSpace' | 'scrollToComments'
>;

export function useEntitySidePanel() {
  const getContext = useActionContext('entity_vote_buttons', 'entity', '');

  const target = useAtomValue(entitySidePanelAtom);
  const setTarget = useSetAtom(openEntitySidePanelAtom);

  const openSidePanel = (
    entityId: string,
    entitySpaceId: string,
    openedWithMainViewEditing: boolean,
    options?: OpenSidePanelOptions
  ) =>
    setTarget({
      entityId,
      analyticsContext: getContext({ target_type: 'entity', target_id: entityId }),
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
