'use client';

import { useAtom } from 'jotai';

import { useActionContext } from '~/core/action-context-provider';

import { type EntitySidePanelTarget, entitySidePanelAtom } from '~/atoms';

export type OpenSidePanelOptions = Pick<
  EntitySidePanelTarget,
  'openedFromReviewEdits' | 'forceRequestedSpace' | 'scrollToComments' | 'initialTab'
>;

export function useEntitySidePanel() {
  const getContext = useActionContext('entity_vote_buttons', 'entity', '');
  const [target, setTarget] = useAtom(entitySidePanelAtom);

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
