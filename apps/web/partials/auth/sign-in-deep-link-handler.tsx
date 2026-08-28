'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { requestsSignInModal, signInModalSource, urlWithoutSignInModal } from '~/core/auth/sign-in-deep-link';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

/**
 * GEO-2727. Opens the Privy sign-in dialog for a viewer who arrived on `?modal=signin`.
 *
 * Mounted app-wide rather than on Explore, even though `/explore?modal=signin` is the only link
 * anyone is shipping today. The trigger is a property of the URL, not of that page, and a handler
 * that lives on one route has to be re-implemented for the second link — which the ticket already
 * anticipates. Nothing here reads the pathname beyond preserving it.
 */
export function SignInDeepLinkHandler() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();

  const requested = requestsSignInModal(searchParams);
  const source = signInModalSource(searchParams);
  const cleanUrl = urlWithoutSignInModal(pathname ?? '/', searchParams);

  const openSignIn = usePrivySignIn(undefined, {
    // Not the current URL, which still holds the trigger: a viewer who signs up goes through
    // onboarding and gets pushed back here afterwards, and being handed the modal a second time
    // is exactly the confusion the modal was opened to resolve.
    redirectTo: cleanUrl,
    analytics: { link_source: source ?? undefined },
  });

  // One open per arrival. The params are cleared below, so this is belt-and-braces against the
  // window between `replaceState` and Next syncing `useSearchParams` — but that window is real,
  // and without the guard the dialog would be asked to open twice in it.
  const handledRef = React.useRef(false);

  React.useEffect(() => {
    if (!requested) {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    // `authenticated` is not trustworthy until Privy has finished restoring a session, and
    // acting early would open a login dialog for somebody who is already signed in.
    if (!ready) return;

    handledRef.current = true;

    // Cleared whether or not the dialog opens, and before it does. A trigger that survives in the
    // address bar reopens on refresh, on back, and for whoever the viewer sends the URL to.
    window.history.replaceState(null, '', cleanUrl);

    // Already signed in: the link has done its job by landing them here, and a login dialog over
    // a live session is noise. This is the ticket's stated behaviour for that case.
    if (authenticated) return;

    openSignIn();
  }, [authenticated, cleanUrl, openSignIn, ready, requested]);

  return null;
}
