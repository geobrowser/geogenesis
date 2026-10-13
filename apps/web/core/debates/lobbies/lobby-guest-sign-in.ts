'use client';

import * as React from 'react';

import type { AnalyticsProperties } from '~/core/analytics';
import { useEffectOnceWhen } from '~/core/hooks/use-effect-once';
import { type PrivySignInCallOptions, usePrivySignIn } from '~/core/hooks/use-privy-sign-in';

import { dashlessId } from '../api';
import { debateRoomPath } from '../rooms/room-routes';
import { LOBBY_LINK_VIA } from './lobby-analytics';

/** The lobby page's own attribution, the same the shared link's sign-in sends (GEO-3126). */
export function lobbyAuthPage(lobbyId: string): AnalyticsProperties {
  const id = dashlessId(lobbyId);
  return {
    page_type: 'debate_room',
    page_entity_id: id,
    page_entity_type: 'debate_lobby',
    link_source: LOBBY_LINK_VIA,
  };
}

/**
 * Sign-in from inside a lobby, for a visitor listening without an account. Returns to the lobby
 * itself, so onboarding ends here rather than on Explore and the page is never left.
 */
export function useLobbyGuestSignIn(lobbyId: string) {
  const redirectTo = debateRoomPath(dashlessId(lobbyId));
  const signIn = usePrivySignIn(undefined, {
    redirectTo,
    analytics: () => ({
      ...lobbyAuthPage(lobbyId),
      component: 'sign_in_prompt',
      target_type: 'debate_lobby',
      target_id: dashlessId(lobbyId),
      auth_control: 'join_lobby',
      auth_trigger: 'control',
    }),
  });

  return React.useCallback(
    (properties?: AnalyticsProperties, options?: PrivySignInCallOptions) =>
      void signIn(properties, { redirectTo, ...options }),
    [redirectTo, signIn]
  );
}

const promptedKey = (lobbyId: string) => `geo.debates.lobby-sign-in-prompted.${dashlessId(lobbyId)}`;

/**
 * Records that this tab has opened the account prompt for a lobby; true only the first time. Shared
 * with the sign-in deep link, so a visitor it already prompted is not prompted again on arrival.
 */
export function claimLobbySignInPrompt(lobbyId: string) {
  try {
    if (window.sessionStorage.getItem(promptedKey(lobbyId))) return false;
    window.sessionStorage.setItem(promptedKey(lobbyId), '1');
  } catch {
    // Without storage it asks once per visit rather than once per tab.
  }
  return true;
}

/**
 * GEO-3270. A visitor without an account can do nothing in a lobby yet, so the account prompt opens
 * as they arrive rather than behind a notice. Once per lobby per tab, so closing it and reloading
 * does not put it back; the guest banner's Log in and Create account open it again.
 */
export function useLobbySignInPrompt(lobbyId: string, open: boolean) {
  const signIn = useLobbyGuestSignIn(lobbyId);
  useEffectOnceWhen(
    open,
    () => {
      if (claimLobbySignInPrompt(lobbyId)) signIn({ component: 'lobby_sign_in_prompt', auth_trigger: 'page_load' });
    },
    lobbyId
  );
}
