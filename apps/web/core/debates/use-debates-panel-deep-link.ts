'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import { usePathname } from 'next/navigation';

import { DEBATES_MODAL, debatesPanelTab, toDebatesPanel } from '~/core/debates/debates-panel-deep-link';
import { tabNeedsSignIn } from '~/core/debates/matchmaking/signed-out-tabs';
import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

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
 */
export function useDebatesPanelDeepLink() {
  const { ready, authenticated } = usePrivy();
  const { open } = useDebatesHub();
  const link = useDeepLinkParams(DEBATES_MODAL);
  const pathname = usePathname();
  const tab = debatesPanelTab(link.target);
  const needsSignIn = tab !== null && tabNeedsSignIn(tab);

  // The tab to open once the sign-in this hook started settles, either way.
  const pendingTabRef = React.useRef<DebatesHubTab | null>(null);
  const openPending = () => {
    const pending = pendingTabRef.current;
    pendingTabRef.current = null;
    if (pending) open(pending);
  };

  const signIn = usePrivySignIn(openPending, {
    // A new account goes through onboarding and is sent back here afterwards. The cleared URL would
    // land them on the page with the hub shut, so hand back the link itself: signed in by then, it
    // opens the tab it named.
    redirectTo: tab ? toDebatesPanel({ tab, pathname: pathname ?? undefined, via: link.via ?? undefined }) : undefined,
    analytics: {
      link_source: link.via ?? undefined,
      component: 'debate_matchmaking',
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
        pendingTabRef.current = tab;
        signIn();
        return;
      }
      // `undefined` rather than null: `open()` falls back to the hub's own landing tab, so this
      // module never has a second opinion about what that is.
      open(tab ?? undefined);
    },
  });
}
