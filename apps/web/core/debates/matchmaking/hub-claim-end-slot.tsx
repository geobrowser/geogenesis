'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { ClaimEndSlot, WatchLiveLink } from '~/core/claims/browse/claim-end-slot';
import { useClaimMatchup } from '~/core/claims/browse/use-claim-matchup';
import { useRematchPanelContext } from '~/core/debates/rematch-panel-context';
import { urlWithoutModal } from '~/core/deep-links/modal-deep-link';

import { Tooltip } from '~/design-system/tooltip';

import type { Debate, DebateClaimSummary } from '../api';
import { claimSlotPillClass } from '../request-debate-control';
import { WATCH_LIVE_ENABLED } from '../watch-live';
import { claimPickKey } from './calendar-narrowing';
import { calendarHref } from './debate-calendar-route';
import { type DebateAnalyticsSurface, debateActionAnalyticsAttributes } from './hub-analytics';
import { useHubAsk } from './hub-ask-context';
import { useDebatesHub } from './use-debates-hub';
import { type OutgoingAsk, askIsForClaim, useAskClock } from './use-outgoing-ask';

/** The end slot's pill, one step taller on a phone (Specs: h-5 desktop, h-6 phone). */
const PILL_CLASS_NAME = cx(claimSlotPillClass('inline'), 'md:h-6');

/**
 * A hub card's end slot (GEO-3463): Debate now when someone on the other side is online, with a
 * small Schedule beside it; Schedule alone when nobody is; "Requesting · m:ss" on the card whose
 * request is out; and every other Debate now paused until that request ends.
 *
 * Its own component rather than a branch of `ClaimEndSlot`, which also ends the meta row of feed
 * cards and the claim page. Those surfaces have no strip to say a request is out and no Cancel to
 * take it back, so they keep "Request debate" until the label pass outside the panel reaches them.
 */
export function HubClaimEndSlot({
  claim,
  ask,
  activeDebate,
  viewerPosition,
  someoneOnline,
  analyticsSurface = 'hub',
}: {
  claim: DebateClaimSummary;
  /** The viewer's open ask, from `HubAskProvider`. */
  ask: OutgoingAsk | null;
  activeDebate?: Debate | boolean | null;
  /** As on `ClaimEndSlot`: a side, `null` for none, `undefined` for not known yet. */
  viewerPosition: boolean | null | undefined;
  /** See `MatchmakingClaimCard`'s prop of the same name. */
  someoneOnline?: boolean;
  analyticsSurface?: DebateAnalyticsSurface;
}) {
  const { match, blockedReason, isRequesting, requestError, request } = useClaimMatchup({
    claimId: claim.claim_entity_id,
    spaceId: claim.space_id,
    viewerPosition,
  });

  if (askIsForClaim(ask, claim.claim_entity_id) && ask) {
    return <RequestingPill expiresAt={ask.expiresAt} />;
  }

  // The same contradiction `ClaimEndSlot` withdraws its offer on: a match computed for the side the
  // viewer has since stepped off names someone standing on their own side now.
  const matchedSide = match ? (match.viewer_response?.position ?? match.viewer_position) : null;
  const contradictsViewerSide =
    matchedSide !== null && matchedSide !== undefined && viewerPosition !== undefined && matchedSide !== viewerPosition;
  const offersDebate = Boolean(match) && !contradictsViewerSide && someoneOnline !== false;

  if (offersDebate) {
    // Paused rather than hidden while another request is out: the offer is still there, it just
    // has to wait its turn, and a button vanishing from every other card reads as the list breaking.
    const paused = ask !== null;
    const button = (
      <button
        type="button"
        onClick={paused ? undefined : request}
        {...debateActionAnalyticsAttributes(analyticsSurface, 'Debate now', 'start_debate')}
        disabled={paused || Boolean(blockedReason) || isRequesting}
        aria-busy={isRequesting || undefined}
        className={cx(
          PILL_CLASS_NAME,
          'bg-text text-white hover:bg-text/90 disabled:pointer-events-none disabled:cursor-default',
          paused ? 'disabled:opacity-35' : 'disabled:opacity-50'
        )}
      >
        {/* Both labels in one cell, so the pill does not shrink the moment it is pressed. */}
        <span className="grid place-items-center">
          <span className="invisible col-start-1 row-start-1" aria-hidden>
            Requesting…
          </span>
          <span className="col-start-1 row-start-1">{isRequesting ? 'Requesting…' : 'Debate now'}</span>
        </span>
      </button>
    );
    const reason = paused ? 'One request at a time. Cancel yours to ask on another claim.' : blockedReason;

    return (
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex items-center gap-2.5">
          {/* Not while a request is out: scheduling is the other way to debate this claim, and the
              strip above is where the open request is dealt with first. */}
          {paused ? null : <ScheduleOnClaim claim={claim} variant="link" analyticsSurface={analyticsSurface} />}
          {reason ? (
            <Tooltip
              label={reason}
              position="bottom"
              align="end"
              openOnPress
              trigger={
                <span tabIndex={0} className="inline-flex cursor-default">
                  {button}
                </span>
              }
            />
          ) : (
            button
          )}
        </span>
        {requestError ? (
          <span role="alert" className="text-right text-footnote text-red-01">
            {requestError}
          </span>
        ) : null}
      </span>
    );
  }

  // Nobody on the other side is online. Once the viewer holds a side there is someone to debate
  // later, so Schedule is the main action. On Matches with offline people included the side is held
  // by construction, so it does not wait for the viewer's position to load.
  if (someoneOnline === false || typeof viewerPosition === 'boolean') {
    return <ScheduleOnClaim claim={claim} variant="pill" analyticsSurface={analyticsSurface} />;
  }

  if (WATCH_LIVE_ENABLED && activeDebate) return <WatchLiveLink activeDebate={activeDebate} spaceId={claim.space_id} />;

  // Holds the row's height, for the reason `ClaimEndSlot` does.
  return <span className="h-5 shrink-0 md:h-6" aria-hidden />;
}

/**
 * "Schedule" on a claim: the calendar narrowed to this claim and to the people on the other side of
 * it, with when they are free (decision 33). The panel closes on the way, as the header's Calendar
 * does, and the calendar's Back returns to the page it was opened from.
 */
function ScheduleOnClaim({
  claim,
  variant,
  analyticsSurface,
}: {
  claim: DebateClaimSummary;
  variant: 'link' | 'pill';
  analyticsSurface: DebateAnalyticsSurface;
}) {
  const { close } = useDebatesHub();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = pathname
    ? urlWithoutModal(pathname, searchParams, typeof window === 'undefined' ? '' : window.location.hash)
    : null;
  const href = calendarHref(from, {
    people: [],
    claims: [claimPickKey(claim.space_id, claim.claim_entity_id)],
    matchesOnly: true,
  });

  return (
    <Link
      href={href}
      onClick={close}
      aria-label={`Schedule a debate on “${claim.claim}”`}
      {...debateActionAnalyticsAttributes(analyticsSurface, 'Schedule on claim', 'open_debate_calendar')}
      className={
        variant === 'link'
          ? 'shrink-0 text-[13px] leading-none text-grey-04 transition-colors hover:text-text hover:underline'
          : cx(PILL_CLASS_NAME, 'border border-grey-02 bg-white text-text hover:bg-grey-01')
      }
    >
      Schedule
    </Link>
  );
}

/** The pressed card's button while its request is out, counting down the real expiry. */
function RequestingPill({ expiresAt }: { expiresAt: string }) {
  const { remainingMs, label } = useAskClock(expiresAt);
  const seconds = Math.ceil(remainingMs / 1_000);
  return (
    <span
      role="timer"
      aria-label={`Requesting, ${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`}
      className={cx(PILL_CLASS_NAME, 'bg-white text-text tabular-nums ring-1 ring-text ring-inset')}
    >
      Requesting · {label}
    </span>
  );
}

/**
 * The card's end slot: the hub's own inside a hub surface, the shared one everywhere else. A rematch
 * picker's claims belong to its pair, so they keep `ClaimEndSlot`, which routes them to the rematch
 * slot rather than to a matchmaking opponent.
 */
export function CardEndSlot(props: Omit<React.ComponentProps<typeof HubClaimEndSlot>, 'ask'>) {
  const ask = useHubAsk();
  const rematch = useRematchPanelContext();
  if (ask === undefined || rematch) {
    return (
      <ClaimEndSlot
        claimId={props.claim.claim_entity_id}
        spaceId={props.claim.space_id}
        activeDebate={props.activeDebate}
        viewerPosition={props.viewerPosition}
      />
    );
  }
  return <HubClaimEndSlot {...props} ask={ask} />;
}
