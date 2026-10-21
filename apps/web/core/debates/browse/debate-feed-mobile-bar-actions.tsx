'use client';

import * as React from 'react';

import { usePrivy } from '~/core/wallet/auth-hooks';

import { NavbarActions } from '~/partials/navbar/navbar-actions';

import { DebatesHubButton } from '../matchmaking/debates-hub-button';

/**
 * The bar's right side: the navbar's own account controls in their compact size, so Log in, the
 * avatar and its menu behave exactly as they do in the navbar. Signed out it is Log in alone, per the
 * design; the Debate button joins once there is an account for its requests and lobbies to belong to.
 */
export function DebateFeedMobileBarActions() {
  const { authenticated } = usePrivy();

  return (
    // `-mr-2` takes back the last target's padding, so the visible pill or avatar lines up with the
    // feed's 16px edge.
    <div className="-mr-2 flex items-center">
      {authenticated ? <DebatesHubButton compact /> : null}
      <NavbarActions compact signInComponent="debate_feed_bar" />
    </div>
  );
}
