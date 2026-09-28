'use client';

import { DEBATES_MODAL, debatesPanelTab } from '~/core/debates/debates-panel-deep-link';
import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';

/**
 * GEO-2746. Opens the debates hub for a viewer who arrived on `?modal=debates`.
 *
 * No auth gate. The hub is open to signed-out viewers with Claims and People (GEO-2725) and
 * narrows its own tabs, so this link works logged out — which is what the ticket asks for.
 */
export function useDebatesPanelDeepLink() {
  const { open } = useDebatesHub();
  const link = useDeepLinkParams(DEBATES_MODAL);

  useDeepLinkEffect({
    ...link,
    // `undefined` rather than null: `open()` falls back to the hub's own landing tab, so this
    // module never has a second opinion about what that is.
    run: () => open(debatesPanelTab(link.target) ?? undefined),
  });
}
