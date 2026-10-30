'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { CLAIM_RESPONSE_KIND, isAwaitingResponseSubmission } from '~/core/responses/entity-response';

import { CloseSmall } from '~/design-system/icons/close-small';

import { trustedIndexedPosition } from '../backfill-readiness-for-held-position';
import { DebateClaimCardSurface } from '../debate-claim-card-surface';
import type { CalloutClaim } from '../todays-claims/todays-callout';
import { todaysCardScope } from '../todays-claims/todays-claims-attribution';
import type { TodaysCallout } from '../todays-claims/use-todays-callout';
import { hubAnalyticsAttributes } from './hub-analytics';
import { HUB_CALLOUT_CLASS_NAME, HubCalloutTitle } from './hub-callout';
import { HUB_ICON_BUTTON_CLASS_NAME, HubPillButton } from './hub-pill-button';
import { HubScrollSelectorProvider } from './hub-scroll';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { taggedClaimEntry } from './tagged-claim-entry';

/** How long the side just taken stays on screen before the next claim replaces it. */
export const CALLOUT_ADVANCE_DELAY_MS = 700;

type Props = {
  callout: TodaysCallout;
  /** The side panel's banner slot, or the full-screen hub under its title (mockups 2c and 2d). */
  layout: 'panel' | 'hub';
  /** Opens Matches, the one action once every claim is answered. */
  onFindDebate: () => void;
};

/**
 * GEO-3498. The daily Today's claims callout: one claim at a time from the day's set, on the
 * standard claim card, with Skip and the set's progress. Once nothing is left to ask it offers
 * Matches, and says the viewer is set for today only when every claim was answered rather than
 * skipped. Dismissing it hides it until the next agenda day, and so does closing the surface once
 * the end card is up (`useTodaysCallout`).
 *
 * Draw it only while `callout.visible`.
 */
export function TodaysClaimsCallout({ callout, layout, onFindDebate }: Props) {
  const { step, claims } = callout;
  if (!step) return null;

  const current = step.current;
  const finished = current === null;
  const title = step.allAnswered ? 'You’re set for today' : 'Today’s claims';
  const headingLevel = layout === 'hub' ? 'h2' : 'h3';
  const answeredCount = step.done.filter(Boolean).length;

  const dots = (
    <ol aria-label={`${answeredCount} of ${claims.length} answered`} className="flex items-center gap-1.5">
      {claims.map((claim, index) => (
        <li
          key={claim.claimId}
          aria-hidden
          className={cx(
            'size-1.5 rounded-full',
            step.done[index] || index === step.currentIndex ? 'bg-text' : 'bg-grey-03'
          )}
        />
      ))}
    </ol>
  );
  const action = finished ? (
    <HubPillButton
      variant="primary"
      analyticsSurface="hub"
      analyticsLabel="Todays claims callout find a debate"
      analyticsIntent="navigate_debates_hub"
      onClick={onFindDebate}
    >
      Find a debate
    </HubPillButton>
  ) : (
    <button
      type="button"
      onClick={() => callout.skip(current.claimId)}
      {...hubAnalyticsAttributes('Todays claims callout skip')}
      className="text-metadata text-grey-04 transition-colors hover:text-text"
    >
      Skip
    </button>
  );
  const dismiss = (
    <button
      type="button"
      aria-label="Dismiss Today’s claims"
      onClick={callout.dismiss}
      {...hubAnalyticsAttributes('Todays claims callout dismiss')}
      className={HUB_ICON_BUTTON_CLASS_NAME}
    >
      <CloseSmall />
    </button>
  );
  const card = current ? (
    <CalloutCard key={current.claimId} callout={callout} claim={current} position={step.currentIndex + 1} />
  ) : null;

  if (layout === 'hub') {
    return (
      <section
        aria-label="Today’s claims"
        data-testid="todays-claims-callout"
        className={cx(
          HUB_CALLOUT_CLASS_NAME,
          'relative mb-4 flex items-center gap-6 pr-12 md:flex-col md:items-stretch md:gap-3'
        )}
      >
        <div className="flex w-48 shrink-0 flex-col items-start gap-3 md:w-auto">
          <HubCalloutTitle as={headingLevel} title={title} />
          {dots}
          {action}
        </div>
        {card ? <div className="min-w-0 flex-1">{card}</div> : null}
        <div className="absolute top-3 right-3">{dismiss}</div>
      </section>
    );
  }

  return (
    <section
      aria-label="Today’s claims"
      data-testid="todays-claims-callout"
      className={cx(HUB_CALLOUT_CLASS_NAME, 'mx-4 mb-3 shrink-0')}
    >
      <HubCalloutTitle as={headingLevel} title={title}>
        {dismiss}
      </HubCalloutTitle>
      {card ? <div className="mt-3">{card}</div> : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        {dots}
        {action}
      </div>
    </section>
  );
}

/**
 * The claim the callout is asking about. Once the bundler has the viewer's side — the point the rest
 * of the UI treats a response as made — it stays a moment so the pressed pill is seen, then the next
 * claim takes its place. A write that fails before then leaves the card up with its error. A side
 * already held — taken on another surface since the set was chosen — moves on straight away.
 */
function CalloutCard({ callout, claim, position }: { callout: TodaysCallout; claim: CalloutClaim; position: number }) {
  const { markAnswered, skip } = callout;
  const entity = callout.entityOf(claim.claimId);
  const target = {
    entityId: claim.claimId,
    entityName: entity?.name ?? '',
    spaceId: claim.spaceId,
    responseKind: CLAIM_RESPONSE_KIND,
  };
  const indexing = useEntityResponseIndexingSnapshot(target);
  const summary = useClaimResponseSummary(claim.claimId, claim.spaceId, CLAIM_RESPONSE_KIND, Boolean(entity));
  const takingSide = indexing.status !== 'idle' && indexing.pending !== null;
  const tookSide = takingSide && indexing.pending?.expectedResponse != null && !isAwaitingResponseSubmission(indexing);
  const heldAlready = trustedIndexedPosition(summary, takingSide) !== null;

  React.useEffect(() => {
    if (heldAlready) {
      markAnswered(claim.claimId);
      return;
    }
    if (!tookSide) return;
    const timer = window.setTimeout(() => markAnswered(claim.claimId), CALLOUT_ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [claim.claimId, heldAlready, markAnswered, tookSide]);

  // A claim the graph no longer has can't be answered; the next one is asked instead. Only once the
  // lookup has answered: a failed one is not an answer, and skipping on it would empty the set.
  const missing = !entity && callout.entitiesSettled;
  React.useEffect(() => {
    if (missing) skip(claim.claimId);
  }, [claim.claimId, missing, skip]);

  if (!entity) return null;

  const entry = taggedClaimEntry(entity, claim.spaceId, callout.rowOf(claim));
  return (
    // The callout sits outside the hub's scroll box, so its card measures against the viewport.
    <HubScrollSelectorProvider value={undefined}>
      <DebateClaimCardSurface
        claimId={claim.claimId}
        listId="todays_claims_callout"
        position={position}
        scope={todaysCardScope(claim.agendaId, claim.listedOn, claim.debatesSinceListing, claim.sectionId)}
      >
        <MatchmakingClaimCard
          claim={entry.claim}
          positions={entry.positions}
          readiness={entry}
          activeDebate={entry.active_debate}
          answersReady={callout.answersReadyIn(claim.spaceId)}
          answersMayComeFromIndex
          hideEndSlot
          hideSummary
          analyticsSurface="hub"
        />
      </DebateClaimCardSurface>
    </HubScrollSelectorProvider>
  );
}
