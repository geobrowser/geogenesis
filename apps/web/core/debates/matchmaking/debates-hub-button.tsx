'use client';

import * as React from 'react';

import cx from 'classnames';

import { Megaphone } from '~/design-system/icons/megaphone';

import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useLobbyLineup } from '../lobbies/live-lobbies';
import { LiveLobbiesPreview } from '../lobbies/live-lobbies-preview';
import { useLobbyReminderReplay } from '../lobbies/lobby-reminder-press';
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
/**
 * `compact` is the debate feed's phone bar (GEO-3415): a 22px pill inside a 44px target, with the
 * "Debate" word and the live chip kept, since that bar has the room the phone navbar does not. It
 * leaves the reminder replay to the navbar's button, which stays mounted under the feed, so a
 * queued reminder is set once rather than by both.
 */
export function DebatesHubButton({ compact = false }: { compact?: boolean } = {}) {
  const { authenticated } = useGeoChatAuth();
  const { isOpen, toggle } = useDebatesHub();
  const { data: activity } = useDebateActivity();
  // Read-only: the coordinator already fetches this list whenever there is anything in it, and the
  // badge must agree with the one in the panel rather than counting requests that have expired.
  const { data: requests } = useDebateRequests(false);
  const incoming = useUnexpiredRequests(requests?.incoming ?? []);

  // Guarded rather than relying on the lookups being empty: a stale cache from a session that has
  // since signed out would otherwise badge the button for nobody.
  const requestCount = !authenticated
    ? 0
    : (requests ? incoming.length : (activity?.incoming_request_count ?? 0)) +
      (activity?.scheduled_awaiting_answer_count ?? 0);

  // GEO-3268. Mounting the lineup here, on every page, is also what keeps the lobby list live with
  // the panel closed: it holds the matchmaking scope that carries `debate.lobbies_changed`.
  const { live } = useLobbyLineup();
  const liveLabel = liveLobbiesLabel(live);

  const ariaLabel = [
    'Debate',
    live.length === 0 ? null : live.length === 1 ? 'a lobby is live' : `${live.length} lobbies are live`,
    requestCount > 0 ? `${requestCount} pending ${requestCount === 1 ? 'request' : 'requests'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (compact) {
    return (
      <LiveLobbiesPreview lobbies={live} disabled={isOpen}>
        <button
          type="button"
          data-debates-hub-opener
          data-geo-analytics-label="Debate feed bar debate hub toggle"
          data-geo-analytics-intent="toggle_debates_hub"
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          onClick={() => toggle()}
          className="group flex h-11 min-w-11 shrink-0 items-center justify-center px-1 focus-visible:outline-none"
        >
          <span
            className={cx(
              'flex h-[22px] items-center gap-[5px] rounded-full text-[13px] leading-none tracking-[-0.2px] whitespace-nowrap transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-text group-focus-visible:ring-offset-2',
              liveLabel
                ? 'bg-[#151515] pr-0.5 pl-[7px] text-white'
                : cx('px-2', isOpen ? 'bg-divider text-text' : 'bg-grey-01 text-text')
            )}
          >
            <Megaphone size={14} />
            <span>Debate</span>
            {requestCount > 0 ? <span className="font-medium">{requestCount}</span> : null}
            {liveLabel ? (
              <span
                aria-hidden
                className="inline-flex h-[18px] items-center gap-1 rounded-full bg-green pr-[7px] pl-1.5 text-[11.5px] font-medium text-text"
              >
                <span className="size-[5px] animate-pulse-strong rounded-full bg-text motion-reduce:animate-none" />
                {liveLabel}
              </span>
            ) : null}
          </span>
        </button>
      </LiveLobbiesPreview>
    );
  }

  return (
    <>
      {/* GEO-3289. A reminder a visitor asked for before signing up is set from here once their
          account can, so it does not wait on the panel being open or the lobby's card still showing. */}
      <LobbyReminderReplay />
      <LiveLobbiesPreview lobbies={live} disabled={isOpen}>
        <button
          type="button"
          data-debates-hub-opener
          data-geo-analytics-label="Navbar debate hub toggle"
          data-geo-analytics-intent="toggle_debates_hub"
          // The pending count is the whole point of the button, and an aria-label would otherwise
          // override the visible number. It says "Debate" to match the label below: a control should
          // answer to the word it shows, so the two move together.
          //
          // Counted, because this is read aloud and "1 pending requests" is not a sentence.
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          onClick={() => toggle()}
          className={cx(
            'relative flex items-center gap-1.5 rounded-full transition-colors duration-200',
            // Live: the navbar's black pill, the Log in button's, so it reads as the thing to press.
            // The chip sits 4px in from the right edge; phones drop it, and the usual padding returns.
            liveLabel
              ? 'bg-[#151515] py-1 pr-1 pl-2.5 text-white hover:bg-[#151515]/90 focus:bg-[#151515]/90 mobile:px-2.5 mobile:py-1.5'
              : cx(
                  'px-2.5 py-1.5',
                  isOpen ? 'bg-divider text-text' : 'bg-grey-01 text-text hover:bg-divider focus:bg-divider'
                )
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
          <span className="text-browseMenu font-normal not-italic mobile:hidden">Debate</span>
          {requestCount > 0 ? <span className="text-metadataMedium leading-none">{requestCount}</span> : null}
          {liveLabel ? (
            <>
              {/* The chip: green with a pulsing dot, "Live · 14" for one lobby and "2 live" for more.
                Phones have no room for it beside the icon, so they get the dot alone. */}
              <span
                aria-hidden
                className="inline-flex h-5 items-center gap-[5px] rounded-full bg-green pr-2 pl-[7px] text-breadcrumb text-text mobile:hidden"
              >
                <span className="size-1.5 animate-pulse-strong rounded-full bg-text motion-reduce:animate-none" />
                {liveLabel}
              </span>
              <span
                aria-hidden
                data-testid="live-lobby-dot"
                className="absolute -top-0.5 -right-0.5 hidden size-2.5 animate-pulse-strong rounded-full border-2 border-white bg-green motion-reduce:animate-none mobile:block"
              />
            </>
          ) : null}
        </button>
      </LiveLobbiesPreview>
    </>
  );
}

/** The chip's words: the one lobby's headcount, or how many lobbies; `null` with none live. */
export function liveLobbiesLabel(live: { headcount: number }[]) {
  if (live.length === 0) return null;
  return live.length === 1 ? `Live · ${live[0]!.headcount}` : `${live.length} live`;
}

/** The replay as a component, so the compact button can leave it out without a conditional hook. */
function LobbyReminderReplay() {
  useLobbyReminderReplay();
  return null;
}
