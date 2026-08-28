'use client';

import * as React from 'react';

import cx from 'classnames';

import { Megaphone } from '~/design-system/icons/megaphone';

import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useDebateRequests } from './hooks';
import { useDebatesHub } from './use-debates-hub';
import { useUnexpiredRequests } from './use-request-countdown';

/**
 * Navbar entry point for the matchmaking hub.
 *
 * Shown to everyone, signed in or not (GEO-2725). It used to be hidden signed out, on the grounds
 * that every tab behind it needed an identity — true until Claims and People became readable
 * anonymously, at which point hiding it left the one way into them unreachable.
 *
 * The badge is still a signed-in thing: it counts requests addressed to somebody. Both lookups
 * behind it are gated on the session already — `useDebateActivity` on `authenticated`, and the
 * requests list is read-only here — so signed out nothing is fetched and the count is simply zero.
 */
export function DebatesHubButton() {
  const { authenticated } = useGeoChatAuth();
  const { isOpen, toggle } = useDebatesHub();
  const { data: activity } = useDebateActivity();
  // Read-only: the coordinator already fetches this list whenever there is anything in it, and the
  // badge must agree with the one in the panel rather than counting requests that have expired.
  const { data: requests } = useDebateRequests(false);
  const incoming = useUnexpiredRequests(requests?.incoming ?? []);

  // Guarded rather than relying on the lookups being empty: a stale cache from a session that has
  // since signed out would otherwise badge the button for nobody.
  const requestCount = !authenticated ? 0 : requests ? incoming.length : (activity?.incoming_request_count ?? 0);

  return (
    <button
      type="button"
      data-debates-hub-opener
      // The pending count is the whole point of the button, and an aria-label would otherwise
      // override the visible number. It says "Debate" to match the label below: a control should
      // answer to the word it shows, so the two move together.
      //
      // Counted, because this is read aloud and "1 pending requests" is not a sentence.
      aria-label={
        requestCount > 0 ? `Debate, ${requestCount} pending ${requestCount === 1 ? 'request' : 'requests'}` : 'Debate'
      }
      aria-expanded={isOpen}
      onClick={() => toggle()}
      className={cx(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors duration-200',
        isOpen ? 'bg-divider text-text' : 'bg-grey-01 text-text hover:bg-divider focus:bg-divider'
      )}
    >
      <Megaphone />
      {/* A megaphone says nothing about debates on its own (GEO-2689). "Debate" reads as the
          invitation the button is, where the panel behind it stays headed "Debates" for the things
          it lists — the `aria-label` above follows this word rather than the panel's, so the button
          answers to what it shows.

          Set in the browse sidebar's menu type, which is the nearest navigation text on screen.

          Dropped on phones, where the navbar has the least room to give and the label is the only
          thing here that can be spared. The `aria-label` carries the name through regardless, so
          nothing is lost for anyone reading it that way. */}
      <span className="text-browseMenu font-normal not-italic sm:hidden">Debate</span>
      {requestCount > 0 ? <span className="text-metadataMedium leading-none">{requestCount}</span> : null}
    </button>
  );
}
