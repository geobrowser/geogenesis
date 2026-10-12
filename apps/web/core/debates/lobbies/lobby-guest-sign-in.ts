'use client';

import * as React from 'react';

import type { AnalyticsProperties } from '~/core/analytics';
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
