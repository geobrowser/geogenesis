'use client';

import * as React from 'react';

import cx from 'classnames';

import { useDebatesEnabled } from '~/core/state/feature-flags';

import { Megaphone } from '~/design-system/icons/megaphone';

import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useDebateRequests } from './hooks';
import { useDebatesHub } from './use-debates-hub';
import { useUnexpiredRequests } from './use-request-countdown';

/**
 * Navbar entry point for the matchmaking hub. Shown to signed-in users once debates are enabled —
 * including those who are not available to debate, since the hub is where they turn it on. Every
 * tab behind it is geo-chat data that needs an identity, so a signed-out visitor has nothing to
 * open it for.
 */
export function DebatesHubButton() {
  const isDebatesEnabled = useDebatesEnabled();
  // False until Privy has restored the session, so the button stays hidden until we actually know
  // — appearing late beats flashing in and out for someone who was never signed in.
  const { authenticated } = useGeoChatAuth();
  const { isOpen, toggle } = useDebatesHub();
  const { data: activity } = useDebateActivity(isDebatesEnabled);
  // Read-only: the coordinator already fetches this list whenever there is anything in it, and the
  // badge must agree with the one in the panel rather than counting requests that have expired.
  const { data: requests } = useDebateRequests(false);
  const incoming = useUnexpiredRequests(requests?.incoming ?? []);

  if (!isDebatesEnabled || !authenticated) return null;

  const requestCount = requests ? incoming.length : (activity?.incoming_request_count ?? 0);

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
