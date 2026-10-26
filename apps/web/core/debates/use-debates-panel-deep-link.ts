'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';

import {
  DEBATES_MODAL,
  debatesPanelRequestId,
  debatesPanelTab,
  toDebatesPanel,
} from '~/core/debates/debates-panel-deep-link';
import { tabNeedsSignIn } from '~/core/debates/matchmaking/signed-out-tabs';
import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { usePrivy } from '~/core/wallet/auth-hooks';

import type { DebatesHubTab } from '~/atoms';

/**
 * GEO-2746. Opens the debates hub for a viewer who arrived on `?modal=debates`.
 *
 * No auth gate for the tabs that read fine signed out (Explore, People): the hub narrows its own
 * row, so those links work logged out, which is what the ticket asks for.
 *
 * A link naming a signed-in-only tab is different. The scheduling emails send people to Requests,
 * and signed out there is no Requests tab: the hub opened on Explore, and the request the email was
 * about was nowhere to be seen. So a signed-out visitor is asked to sign in first, and the hub opens
 * on the tab the link named once they have. Dismissing the sign-in still opens the hub, on what it
 * can show them.
 *
 * A link naming one scheduled request (`requests:<id>`, GEO-3431) opens Requests with that request
 * brought into view, through sign-in the same way.
 */
export function useDebatesPanelDeepLink() {
  const { ready, authenticated } = usePrivy();
  const { open } = useDebatesHub();
  const link = useDeepLinkParams(DEBATES_MODAL);
  const pathname = usePathname();
  const tab = debatesPanelTab(link.target);
  const requestId = debatesPanelRequestId(link.target);
  const needsSignIn = tab !== null && tabNeedsSignIn(tab);

  // With the link's request when it named one, and otherwise exactly as before, so every other
  // link opens the hub the way it always has.
  const openOn = (target: DebatesHubTab | undefined, request: string | null) =>
    request ? open(target, request) : open(target);

  // The tab and request to open once the sign-in this hook started settles, either way. Both kept
  // here, not read from the link: the link is cleared on arrival, long before sign-in settles.
  const pendingRef = React.useRef<{ tab: DebatesHubTab; requestId: string | null } | null>(null);
  const openPending = () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) openOn(pending.tab, pending.requestId);
  };

  const signIn = usePrivySignIn(openPending, {
    // A new account goes through onboarding and is sent back here afterwards. The cleared URL would
    // land them on the page with the hub shut, so hand back the link itself: signed in by then, it
    // opens the tab it named.
    redirectTo: tab
      ? toDebatesPanel({
          tab,
          requestId: requestId ?? undefined,
          pathname: pathname ?? undefined,
          via: link.via ?? undefined,
        })
      : undefined,
    analytics: {
      link_source: link.via ?? undefined,
      component: 'debate_matchmaking',
      // GEO-3431: which request, as the Running late and Can't make it links say.
      ...(requestId ? { target_id: requestId, target_type: 'scheduled_debate_request' } : {}),
      auth_control: 'open_debates',
      auth_trigger: 'deep_link',
      auth_intent: 'join_debate',
    },
    onError: openPending,
  });

  useDeepLinkEffect({
    ...link,
    // `authenticated` is not trustworthy until Privy has restored a session, and deciding early
    // would ask a signed-in viewer to sign in. Only links that need it wait.
    enabled: ready || !needsSignIn,
    run: () => {
      if (needsSignIn && !authenticated) {
        pendingRef.current = tab ? { tab, requestId } : null;
        signIn();
        return;
      }
      // `undefined` rather than null: `open()` falls back to the hub's own landing tab, so this
      // module never has a second opinion about what that is.
      openOn(tab ?? undefined, requestId);
    },
  });
}
