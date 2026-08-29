'use client';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { debatesPanelTab, requestsDebatesPanel, urlWithoutDebatesPanel } from '~/core/debates/debates-panel-deep-link';
import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';

/**
 * GEO-2746. Opens the debates hub for a viewer who arrived on `?modal=debates`.
 *
 * Mounted app-wide alongside the hub itself, and a sibling of `SignInDeepLinkHandler` rather than
 * an extension of it: the two share a param scheme, not an action, and the sign-in one has to wait
 * on Privy before it can decide anything. Each ignores a `modal` value it does not own, so neither
 * clears the other's trigger.
 *
 * No auth gate. The hub is open to signed-out viewers with Claims and People (GEO-2725) and
 * narrows its own tabs, so this link works logged out — which is what the ticket asks for.
 */
export function DebatesPanelDeepLinkHandler() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open } = useDebatesHub();

  const requested = requestsDebatesPanel(searchParams);
  const tab = debatesPanelTab(searchParams);
  // Neither `usePathname` nor `useSearchParams` reports the fragment, and `replaceState` below
  // rewrites the whole URL — so a fragment not carried here is a fragment thrown away. Safe to
  // read during render: this component is client-only and the value is settled by the time the
  // effect runs.
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const cleanUrl = urlWithoutDebatesPanel(pathname ?? '/', searchParams, hash);

  // One open per arrival. The params are cleared below, but Next does not necessarily resync
  // `useSearchParams` in the same tick, so without this a re-render inside that window would ask
  // the hub to open a second time.
  const handledRef = React.useRef(false);

  React.useEffect(() => {
    if (!requested) {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;

    handledRef.current = true;

    // Cleared before opening. A trigger left in the address bar reopens the hub on refresh, on
    // back, and for whoever the viewer sends the URL to. Only the query is rewritten, so the
    // hub's own close-on-navigation effect — which watches the pathname — does not fire.
    window.history.replaceState(null, '', cleanUrl);

    // `undefined` rather than null: `open()` falls back to the hub's own landing tab.
    open(tab ?? undefined);
  }, [cleanUrl, open, requested, tab]);

  return null;
}
