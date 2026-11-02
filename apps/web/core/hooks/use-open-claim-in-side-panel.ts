'use client';

import { useEntitySidePanel } from './use-entity-side-panel';

/**
 * Opens a claim beside a page that navigating away would lose: a lobby's room and audio (GEO-3332),
 * a rematch's session. In the space it was listed in, which is where its page link went.
 *
 * Its own module, over `useEntitySidePanel`, so a test that mocks the side panel mocks this too.
 */
export function useOpenClaimInSidePanel() {
  const { openSidePanel } = useEntitySidePanel();
  return (claim: { claim_entity_id: string; space_id: string }) =>
    openSidePanel(claim.claim_entity_id, claim.space_id, false, { forceRequestedSpace: true });
}
