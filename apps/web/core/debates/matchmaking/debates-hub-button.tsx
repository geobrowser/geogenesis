'use client';

import * as React from 'react';

import cx from 'classnames';

import { useDebatesEnabled } from '~/core/state/feature-flags';

import { Megaphone } from '~/design-system/icons/megaphone';

import { useDebateActivity } from '../hooks';
import { useDebatesHub } from './use-debates-hub';

/**
 * Navbar entry point for the matchmaking hub. Visible to every user once debates are enabled —
 * including those who are not available to debate, since the hub is where they turn it on.
 */
export function DebatesHubButton() {
  const isDebatesEnabled = useDebatesEnabled();
  const { isOpen, toggle } = useDebatesHub();
  const { data: activity } = useDebateActivity(isDebatesEnabled);

  if (!isDebatesEnabled) return null;

  const requestCount = activity?.incoming_request_count ?? 0;

  return (
    <button
      type="button"
      data-debates-hub-opener
      // The pending count is the whole point of the button, and an aria-label would otherwise
      // override the visible number.
      aria-label={requestCount > 0 ? `Debates, ${requestCount} pending requests` : 'Debates'}
      aria-expanded={isOpen}
      onClick={() => toggle()}
      className={cx(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors duration-200',
        isOpen ? 'bg-divider text-text' : 'bg-grey-01 text-text hover:bg-divider focus:bg-divider'
      )}
    >
      <Megaphone />
      {requestCount > 0 ? <span className="text-metadataMedium leading-none">{requestCount}</span> : null}
    </button>
  );
}
