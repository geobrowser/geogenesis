'use client';

import * as React from 'react';

import cx from 'classnames';

import { DebatesHubButton } from '~/core/debates/matchmaking/debates-hub-button';
import type { SaveVotesPressReason } from '~/core/state/save-votes-prompt';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { NavbarActions } from './navbar-actions';

/** Shared account controls; size changes preserve the profile menu and any ongoing saves. */
export function NavbarAccountActions({
  compact = false,
  placement = 'navbar',
}: {
  compact?: boolean;
  placement?: SaveVotesPressReason;
}) {
  const { authenticated } = usePrivy();

  return (
    // Align the visible pill or avatar with the bar's 16px edge while preserving its touch target.
    <div className={cx('flex items-center', compact ? '-mr-2' : 'gap-3 max-[359px]:gap-1')}>
      {!compact || authenticated ? <DebatesHubButton compact={compact} placement={placement} /> : null}
      <NavbarActions compact={compact} signInComponent={placement} />
    </div>
  );
}
