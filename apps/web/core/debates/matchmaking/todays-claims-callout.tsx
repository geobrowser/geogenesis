'use client';

import * as React from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

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

/** One ease for the whole hand-off, so the card leaving, the next arriving and the height between
 * them read as one movement. */
const CALLOUT_EASE = [0.4, 0, 0.2, 1] as const;
const CALLOUT_SLIDE_PX = 16;

/**
 * The answered card goes left and the next comes in from the right, one after the other, so the move
 * reads as "next claim" rather than as the card's content being swapped. Under the hub's
 * `reducedMotion="user"` the slide drops out and only the fades are left.
 */
const calloutCardMotion = {
  initial: { opacity: 0, x: CALLOUT_SLIDE_PX },
  animate: { opacity: 1, x: 0, pointerEvents: 'auto', transition: { duration: 0.24, ease: CALLOUT_EASE } },
  // No clicks on a card that is on its way out.
  exit: { opacity: 0, x: -CALLOUT_SLIDE_PX, pointerEvents: 'none', transition: { duration: 0.18, ease: CALLOUT_EASE } },
} as const;

type Props = {
  callout: TodaysCallout;
  /** Opens Matches, the one action once every claim is answered. */
  onFindDebate: () => void;
};

/**
 * GEO-3498. The daily Today's claims callout: one claim at a time from the day's set, on the
 * standard claim card, with Skip and the set's progress. Once nothing is left to ask it offers
 * Matches, and says the viewer is set for today only when every claim was answered rather than
 * skipped. Dismissing it hides it until the next agenda day, and so does closing the side panel once
 * the end card is up (`useTodaysCallout`). The side panel only: the full-screen hub doesn't draw it.
 *
 * Draw it only while `callout.visible`.
 */
export function TodaysClaimsCallout({ callout, onFindDebate }: Props) {
  const { step, claims } = callout;
  if (!step) return null;

  const current = step.current;
  const finished = current === null;
  const title = step.allAnswered ? 'You’re set for today' : 'Today’s claims';
  const answeredCount = step.done.filter(Boolean).length;

  const dots = (
    <ol aria-label={`${answeredCount} of ${claims.length} answered`} className="flex items-center gap-1.5">
      {claims.map((claim, index) => (
        <li
          key={claim.claimId}
          aria-hidden
          className={cx(
            'size-1.5 rounded-full transition-colors duration-200',
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

  return (
    <section
      aria-label="Today’s claims"
      data-testid="todays-claims-callout"
      className={cx(HUB_CALLOUT_CLASS_NAME, 'mx-4 mb-3 shrink-0')}
    >
      <HubCalloutTitle as="h3" title={title}>
        {dismiss}
      </HubCalloutTitle>
      <CalloutCardStage>
        <AnimatePresence mode="wait" initial={false}>
          {card ? (
            <motion.div key={current?.claimId} {...calloutCardMotion} className="pt-3">
              {card}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </CalloutCardStage>
      <div className="mt-3 flex items-center justify-between gap-3">
        {dots}
        {action}
      </div>
    </section>
  );
}

/**
 * Eases the callout's height to whatever the card inside it needs — the next claim's, or none once
 * the set is done — so the tabs below it glide rather than jump. It clips only while it moves, so the
 * card's focus rings aren't cut off at rest.
 */
function CalloutCardStage({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = React.useState<number | null>(null);
  const [moving, setMoving] = React.useState(false);
  const observer = React.useRef<ResizeObserver | null>(null);
  const measureRef = React.useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(measure);
    observer.current.observe(node);
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height: height ?? 'auto' }}
      transition={{ duration: 0.24, ease: CALLOUT_EASE }}
      onAnimationStart={() => setMoving(true)}
      onAnimationComplete={() => setMoving(false)}
      className={moving ? 'overflow-hidden' : undefined}
    >
      <div ref={measureRef}>{children}</div>
    </motion.div>
  );
}

/**
 * The claim the callout is asking about. Once the bundler has the viewer's side — the point the rest
 * of the UI treats a response as made — it stays a moment so the pressed pill is seen, then the next
 * claim takes its place. A side already held — taken on another surface since the set was chosen —
 * moves on straight away. The rows can also report a side as soon as the write starts (geo-chat is
 * told then), which moves the card on before the bundler does; that optimism is wanted (Preston,
 * 30 Oct), so a write that fails after that doesn't keep this card up.
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
          // Just the two sides to take: who stands ready on each is the lists' to show.
          showParticipants={false}
          analyticsSurface="hub"
        />
      </DebateClaimCardSurface>
    </HubScrollSelectorProvider>
  );
}
