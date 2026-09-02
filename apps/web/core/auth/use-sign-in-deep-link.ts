'use client';

import { usePrivy } from '@geogenesis/auth';

import { SIGN_IN_MODAL } from '~/core/auth/sign-in-deep-link';
import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

/**
 * GEO-2727. Opens the Privy sign-in dialog for a viewer who arrived on `?modal=signin`.
 *
 * A hook rather than a component so `DeepLinkHandler` can host every link at one mount point —
 * each is only a few lines once the protocol is shared, and a component apiece meant a dynamic
 * import and a Suspense boundary in `app/entry.tsx` for every new link.
 */
export function useSignInDeepLink() {
  const { ready, authenticated } = usePrivy();
  const link = useDeepLinkParams(SIGN_IN_MODAL);

  const openSignIn = usePrivySignIn(undefined, {
    // Not the current URL, which still holds the trigger: a viewer who signs up goes through
    // onboarding and gets pushed back here afterwards, and being handed the modal a second time
    // is exactly the confusion the modal was opened to resolve.
    redirectTo: link.cleanUrl,
    analytics: { link_source: link.via ?? undefined },
  });

  useDeepLinkEffect({
    ...link,
    // `authenticated` is not trustworthy until Privy has finished restoring a session, and acting
    // early would open a login dialog for somebody who is already signed in.
    enabled: ready,
    run: () => {
      // Already signed in: the link has done its job by landing them here, and a login dialog over
      // a live session is noise. The trigger is cleared either way.
      if (authenticated) return;
      openSignIn();
    },
  });
}
