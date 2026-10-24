'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { ClaimEndSlot, WatchLiveLink } from '~/core/claims/browse/claim-end-slot';
import { useClaimMatchup } from '~/core/claims/browse/use-claim-matchup';
import { useRematchPanelContext } from '~/core/debates/rematch-panel-context';

import type { Debate, DebateClaimSummary } from '../api';
import { useGeoChatAuth } from '../hooks';
import { RequestDebateControl, claimSlotPillClass } from '../request-debate-control';
import { WATCH_LIVE_ENABLED } from '../watch-live';
import { claimCalendarPicks } from './debate-calendar-route';
import { type DebateAnalyticsSurface, debateActionAnalyticsAttributes } from './hub-analytics';
import { useHubAsk } from './hub-ask-context';
import { RequestingPill } from './requesting-pill';
import { useCalendarHref } from './use-calendar-href';
import { useDebatesHub } from './use-debates-hub';
import { type OutgoingAsk, askIsForClaim } from './use-outgoing-ask';

/** The end slot's pill, one step taller on a phone (Specs: h-5 desktop, h-6 phone). */
const PILL_CLASS_NAME = cx(claimSlotPillClass('inline'), 'md:h-6');

/**
 * Whether anyone other than the viewer holds the side opposite theirs (GEO-3463). Schedule only
 * makes sense when someone does: otherwise it opens a calendar narrowed to a claim with nobody on it.
 */
export function otherSideHeld(
  positions: readonly { position: boolean; total_count: number }[],
  viewerPosition: boolean | null | undefined
) {
  if (typeof viewerPosition !== 'boolean') return false;
  return positions.some(position => position.position !== viewerPosition && position.total_count > 0);
}

/**
 * A hub card's end slot (GEO-3463): Debate now when someone on the other side is online, with a
 * small Schedule beside it; Schedule alone when nobody is; "Requesting · m:ss" on the card whose
 * request is out; and every other Debate now paused until that request ends.
 *
 * Its own component rather than a branch of `ClaimEndSlot`, which also ends the meta row of feed
 * cards and the claim page. Those surfaces have no strip to say a request is out and no Cancel to
 * take it back, so they keep "Request debate" until the label pass outside the panel reaches them.
 * The offer itself is the same `RequestDebateControl` they draw.
 */
export function HubClaimEndSlot({
  claim,
  ask,
  activeDebate,
  viewerPosition,
  otherSideHeld: heldOpposite,
  analyticsSurface = 'hub',
}: {
  claim: DebateClaimSummary;
  /** The viewer's open ask, from `HubAskProvider`. */
  ask: OutgoingAsk | null;
  activeDebate?: Debate | boolean | null;
  /** As on `ClaimEndSlot`: a side, `null` for none, `undefined` for not known yet. */
  viewerPosition: boolean | null | undefined;
  /** Someone holds the side opposite the viewer's — see {@link otherSideHeld}. */
  otherSideHeld: boolean;
  analyticsSurface?: DebateAnalyticsSurface;
}) {
  const { authenticated } = useGeoChatAuth();
  const { match, blockedReason, isRequesting, requestError, request } = useClaimMatchup({
    claimId: claim.claim_entity_id,
    spaceId: claim.space_id,
    viewerPosition,
  });

  if (ask && askIsForClaim(ask, claim)) {
    return <RequestingPill expiresAt={ask.expiresAt} className={cx(PILL_CLASS_NAME, REQUESTING_CLASS_NAME)} />;
  }

  // The same contradiction `ClaimEndSlot` withdraws its offer on: a match computed for the side the
  // viewer has since stepped off names someone standing on their own side now.
  const matchedSide = match ? (match.viewer_response?.position ?? match.viewer_position) : null;
  const contradictsViewerSide =
    matchedSide !== null && matchedSide !== undefined && viewerPosition !== undefined && matchedSide !== viewerPosition;
  // Signed out there is no one to schedule as, and a device-only vote is not a side anyone can
  // debate — so Schedule waits for an account and for someone actually on the other side.
  const offersSchedule = authenticated && typeof viewerPosition === 'boolean' && heldOpposite;

  if (match && !contradictsViewerSide) {
    // Paused rather than hidden while another request is out: the offer is still there, it just
    // has to wait its turn.
    const paused = ask !== null;
    return (
      <span className="flex shrink-0 items-start gap-2.5">
        {/* Not while a request is out: scheduling is the other way to debate this claim, and the
            strip above is where the open request is dealt with first. */}
        {paused || !offersSchedule ? null : (
          <ScheduleOnClaim claim={claim} variant="link" analyticsSurface={analyticsSurface} />
        )}
        <RequestDebateControl
          onRequest={request}
          label="Debate now"
          paused={paused}
          disabled={Boolean(blockedReason)}
          isRequesting={isRequesting}
          blockedReason={paused ? 'One request at a time. Cancel yours to ask on another claim.' : blockedReason}
          requestError={requestError}
          buttonClassName="md:h-6"
          analytics={debateActionAnalyticsAttributes(analyticsSurface, 'Debate now', 'start_debate')}
        />
      </span>
    );
  }

  // Nobody on the other side is online, but someone holds it: Schedule is the main action.
  if (offersSchedule) return <ScheduleOnClaim claim={claim} variant="pill" analyticsSurface={analyticsSurface} />;

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
  const href = useCalendarHref(claimCalendarPicks(claim.space_id, claim.claim_entity_id));

  return (
    <Link
      href={href}
      onClick={close}
      aria-label={`Schedule a debate on “${claim.claim}”`}
      {...debateActionAnalyticsAttributes(analyticsSurface, 'Schedule on claim', 'open_debate_calendar')}
      className={
        variant === 'link'
          ? 'shrink-0 text-browseSection leading-5 text-grey-04 transition-colors hover:text-text hover:underline md:leading-6'
          : cx(PILL_CLASS_NAME, 'border border-grey-02 bg-white text-text hover:bg-grey-01')
      }
    >
      Schedule
    </Link>
  );
}

const REQUESTING_CLASS_NAME = 'bg-white text-text ring-1 ring-text ring-inset';

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
