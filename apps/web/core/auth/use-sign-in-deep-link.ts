'use client';

import { usePrivy } from '@geogenesis/auth';

import { marketingAuthProperties } from '~/core/auth-attempt';
import { SIGN_IN_MODAL } from '~/core/auth/sign-in-deep-link';
import { dashlessId } from '~/core/debates/api';
import { LOBBY_LINK_VIA } from '~/core/debates/lobbies/lobby-analytics';
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
  const roomId = typeof window === 'undefined' ? undefined : /^\/debate\/([^/]+)$/.exec(window.location.pathname)?.[1];
  // A lobby's shared link (GEO-3126). No `auth_intent`: there is no lobby action to resume.
  const lobbyId = roomId && link.via === LOBBY_LINK_VIA ? dashlessId(roomId) : undefined;

  const openSignIn = usePrivySignIn(undefined, {
    // Not the current URL, which still holds the trigger: a viewer who signs up goes through
    // onboarding and gets pushed back here afterwards, and being handed the modal a second time
    // is exactly the confusion the modal was opened to resolve.
    redirectTo: link.cleanUrl,
    analytics: {
      link_source: link.via ?? undefined,
      component: link.via === 'invite' ? 'invite_link' : 'sign_in_deep_link',
      auth_control: lobbyId ? 'join_lobby' : roomId ? 'join_debate' : 'open_sign_in',
      ...(lobbyId
        ? {
            target_type: 'debate_lobby',
            target_id: lobbyId,
            page_type: 'debate_room',
            page_entity_id: lobbyId,
            page_entity_type: 'debate_lobby',
          }
        : roomId
          ? {
              target_type: 'debate_room',
              target_id: roomId,
              page_type: 'debate_room',
              page_entity_id: roomId,
              page_entity_type: 'debate_room',
              auth_intent: 'join_debate',
            }
          : {}),
      auth_trigger: link.via === 'invite' ? 'invite_link' : 'deep_link',
      ...marketingAuthProperties(typeof window === 'undefined' ? '' : window.location.search),
    },
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
