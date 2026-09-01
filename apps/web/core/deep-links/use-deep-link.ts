'use client';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import {
  type ModalDeepLink,
  modalTarget,
  modalVia,
  requestsModal,
  urlWithoutModal,
} from '~/core/deep-links/modal-deep-link';

/**
 * The protocol every deep link follows: notice the trigger, act on it once, clear it from the URL.
 *
 * Split in two because the order is forced. The sign-in link needs its cleaned URL at *render*
 * time — `usePrivySignIn` takes it as the post-auth destination — but can only act later, once
 * Privy has resolved. So a feature reads the link first, builds whatever it needs, then arms the
 * effect.
 *
 * Factoring this out is not only about repetition. "Clear the trigger, but only your own" is the
 * invariant that keeps two handlers from eating each other's links, and it is safer as one
 * implementation than as a rule each new handler is trusted to reimplement.
 */

export type DeepLink = {
  /** True when the URL is asking for this modal. */
  requested: boolean;
  /** The sub-target, for the modal to interpret. */
  target: string | null;
  /** Attribution, if the link carried any. */
  via: string | null;
  /** The URL with the trigger stripped, fragment and unrelated params intact. */
  cleanUrl: string;
};

export function useDeepLinkParams(modal: ModalDeepLink): DeepLink {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Neither `usePathname` nor `useSearchParams` reports the fragment, and `replaceState` rewrites
  // the whole URL — so a fragment not carried here is a fragment thrown away. Safe to read during
  // render: these hooks only run in client-only components, and the value is settled by the time
  // the effect below runs.
  const hash = typeof window === 'undefined' ? '' : window.location.hash;

  return {
    requested: requestsModal(searchParams, modal),
    target: modalTarget(searchParams),
    via: modalVia(searchParams),
    cleanUrl: urlWithoutModal(pathname ?? '/', searchParams, hash),
  };
}

export function useDeepLinkEffect({
  requested,
  cleanUrl,
  enabled = true,
  run,
}: {
  requested: boolean;
  cleanUrl: string;
  /**
   * Hold the link until the feature can decide what to do with it — Privy has to finish restoring
   * a session before the sign-in link knows whether to open anything. Nothing is cleared while
   * disabled, so the trigger survives until it can actually be acted on.
   */
  enabled?: boolean;
  run: () => void;
}) {
  // Held in a ref so a caller can pass an inline closure without re-arming the effect, and so the
  // closure that eventually runs sees the latest render's values.
  const runRef = React.useRef(run);
  runRef.current = run;

  // One act per arrival. The trigger is cleared below, but Next does not necessarily resync
  // `useSearchParams` in the same tick, so without this a re-render inside that window would run
  // the action a second time.
  const handledRef = React.useRef(false);

  React.useEffect(() => {
    if (!requested) {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    if (!enabled) return;

    handledRef.current = true;

    // Cleared before the action, and whether or not the action does anything visible. A trigger
    // left in the address bar fires again on refresh, on back, and for whoever the viewer sends
    // the URL to. Only the query is rewritten, so anything watching the pathname — the debates
    // hub closes itself on navigation — does not see a change.
    window.history.replaceState(null, '', cleanUrl);

    runRef.current();
  }, [cleanUrl, enabled, requested]);
}
