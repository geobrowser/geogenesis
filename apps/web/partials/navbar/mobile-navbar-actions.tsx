'use client';

import * as React from 'react';

import { DebatesHubButton } from '~/core/debates/matchmaking/debates-hub-button';
import { SaveVotesPressReason } from '~/core/state/save-votes-prompt';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { NavbarActions } from './navbar-actions';

/** Compact login, or Debate and the profile menu once signed in. */
export function MobileNavbarActions({ signInComponent }: { signInComponent: SaveVotesPressReason }) {
  const { authenticated } = usePrivy();

  return (
    // Align the visible pill or avatar with the bar's 16px edge while preserving its touch target.
    <div className="-mr-2 flex items-center">
      {authenticated ? <DebatesHubButton compact /> : null}
      <NavbarActions compact signInComponent={signInComponent} />
    </div>
  );
}
