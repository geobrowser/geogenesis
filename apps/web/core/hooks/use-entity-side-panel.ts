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

/**
 * Opens a claim beside a page that navigating away would lose: a lobby's room and audio (GEO-3332),
 * a rematch's session. In the claim's own space, since neither page has one to fall back on.
 */
export function useOpenClaimInSidePanel() {
  const { openSidePanel } = useEntitySidePanel();
  return (claim: { claim_entity_id: string; space_id: string }) =>
    openSidePanel(claim.claim_entity_id, claim.space_id, false, { forceRequestedSpace: true });
}
