'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';

import { ClaimEndSlot } from '~/core/claims/browse/claim-end-slot';
import { viewerResponseWithIndexedFallback } from '~/core/claims/browse/claim-position-summaries';
import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSummary, ControversialTag } from '~/core/claims/browse/claim-summary';
import { useClaimMatchup, withMatchParticipants } from '~/core/claims/browse/use-claim-matchup';
import {
  useEntityResponse,
  useEntityResponseIndexingSnapshot,
  useResetEntityResponseIndexingSnapshot,
} from '~/core/hooks/use-entity-vote';
import { useLastSettled } from '~/core/hooks/use-last-settled';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import {
  CLAIM_RESPONSE_COPY,
  CLAIM_RESPONSE_KIND,
  RESPONSE_CONFIRMING_COPY,
  type ResponseKind,
  responsePositionLabel,
} from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { NavUtils, validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { OnlineDot } from '~/design-system/online-dot';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type {
  Debate,
  DebateClaimPositionSummary,
  DebateClaimSummary,
  DebateParticipantSummary,
  MatchmakingReadiness,
} from '../api';
import { useGeoChatAuth } from '../hooks';
import { hubCardMotion } from './hub-motion';

type Props = {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  /** Drives the response buttons and the vocabulary the sides are labelled in. */
  readiness: MatchmakingReadiness;
  /**
   * The live debate on this claim, as either geo-chat shape — the `DebateClaim` row carries the
   * debate, the paged index carries only a flag. The end slot surfaces it as "Watch live".
   */
  activeDebate?: Debate | boolean | null;
  /**
   * False while the claim's own state is still arriving, which holds the pills.
   *
   * Two things have to have landed before a press means what it looks like it means: the vocabulary,
   * or the pills publish a stance response against a claim that wants Verify/Dispute; and the
   * viewer's own side, or the side they already hold is drawn unselected and pressing it republishes
   * instead of clearing.
   *
   * Defaults to true for hosts that have already resolved both — the hub's own tabs, whose rows come
   * from geo-chat carrying both.
   */
  answersReady?: boolean;
  /**
   * Whether the indexed response may answer for the viewer's side while geo-chat cannot.
   *
   * For the minute or so after an account is created, geo-chat refuses every viewer-relative read
   * until it has indexed it. The hub panel is geo-chat's surface, so for that whole minute it had
   * nothing — every pill dead — while the same claims in the main feed took positions normally. The
   * feed was never geo-chat-only: it resolves the side through `useClaimResponseState`, which falls
   * back to the indexed read, and that is the entire difference between the two surfaces.
   *
   * A brand new account is also the case where the fallback is most obviously right: it holds no
   * positions, so the indexed read's "no side" is the true answer rather than a stand-in for one.
   *
   * Only the *side* was ever outstanding here. The vocabulary arrives with the claim — the page
   * carries its "Is factual" value — so the fallback completes the one missing fact rather than
   * guessing at two.
   *
   * Still a wait, not a shortcut: the side counts as known once the indexed read has *settled*, and
   * `null` before then is "not yet", not "no side". Drawing both pills unselected over that is what
   * makes a press republish the side the viewer already holds instead of clearing it.
   */
  answersMayComeFromIndex?: boolean;
  /** Why responding is refused outright — an unpublished edit to the claim's own vocabulary. */
  responseBlockedReason?: string | null;
  /** Rendered under the summary, for hosts with something extra to say. */
  footer?: React.ReactNode;
  /**
   * Rendered under one of the two response buttons — see `PositionRow`.
   *
   * A profile uses it to say which side that person came down on, under the
   * button that says the same word.
   */
  noteFor?: (position: boolean) => React.ReactNode;
  /**
   * Leaves the end slot out.
   *
   * For the one host whose offer is not the card's offer: the rematch picker sends a rematch
   * request, its own mutation with its own gating, from a control in its footer. A slot offering
   * `Request debate` above it would be a different button wearing the same words.
   */
  hideEndSlot?: boolean;
  /**
   * Replaces the card's own offer with the host's.
   *
   * For the one host whose offer is not the card's: the rematch picker sends a session-scoped
   * rematch request, its own mutation with its own gating. It used to draw that in a footer, which
   * left the same action wearing two designs depending on which surface you were looking at
   * (GEO-2825). It now passes the same control the card would have rendered, wired to its own
   * mutation, and it lands in the same place.
   */
  endSlot?: React.ReactNode;
  /**
   * Replaces the claim's link to its entity page. The rematch picker opens the side panel instead:
   * following a link there would navigate out of the app shell and abandon the live session.
   */
  onOpenClaim?: () => void;
  /**
   * Set when `positions` cannot be trusted to say which side the viewer is on — the rematch picker
   * identifies the viewer inside the summaries by geo-chat user id, which is null until its token
   * exchange lands. Suppresses the optimistic adjustment rather than making it from a "no position"
   * that only means "don't know yet", which would draw the viewer onto two sides at once.
   */
  viewerIdentityPending?: boolean;
  /** The host has no answer about the viewer's side, rather than an answer of "none" — see below. */
  viewerResponseUnknown?: boolean;
  /**
   * False where geo-chat's silence about the viewer's side must not be filled in from the indexed
   * response (GEO-2823). Only the rematch picker sets it: its sides are the graph's, so an answer
   * from a second source contradicts the pair it is comparing rather than completing it.
   */
  reconcileWithIndexedResponse?: boolean;
  /**
   * Sends a signed-out viewer to Privy instead of publishing. Set by hosts that render to signed-out
   * viewers — the hub's Claims tab and the claim page — and left unset when signing in is not a
   * possibility the host has to handle, which keeps the response path unchanged for everyone else.
   */
  onRequireSignIn?: () => void;
  /** `AnimatePresence mode="popLayout"` measures the exiting row through this; without it the row
   * never pops out of flow and the rows above close the gap only after the fade finishes. */
  ref?: React.Ref<HTMLElement>;
};

/**
 * Whether the knowledge graph can actually resolve this claim. geo-chat keys claims by their graph
 * entity id, but nothing guarantees the id it returns is one the graph will accept — a malformed
 * one makes every graph query for it fail.
 */
export function isResolvableClaim(claim: Pick<DebateClaimSummary, 'space_id' | 'claim_entity_id'>) {
  return validateEntityId(claim.claim_entity_id) && validateSpaceId(claim.space_id);
}

/**
 * One claim, drawn the same way everywhere a claim appears as a card.
 *
 * Taking a side is an on-chain claim response, so the two side pills are the only way to do it —
 * there are deliberately no separate vote arrows here. The pills carry labels and faces and no
 * counts: a control should say what pressing it does, and the faces inside one mean *ready to argue
 * this side*, a viewer-relative offer. How many people have answered is a different question, about
 * the claim rather than the reader, and it lives in the summary underneath.
 *
 * The readiness switch used to ride in the header. It has moved off the card entirely, and the
 * corner it held is now the end slot — which always offers something the reader can act on.
 */
export function MatchmakingClaimCard({
  claim,
  positions,
  readiness,
  activeDebate,
  answersReady,
  answersMayComeFromIndex,
  responseBlockedReason,
  footer,
  noteFor,
  onOpenClaim,
  viewerIdentityPending,
  viewerResponseUnknown,
  reconcileWithIndexedResponse,
  onRequireSignIn,
  hideEndSlot,
  endSlot,
  ref,
}: Props) {
  // geo-chat can hand back a claim the graph has never seen. Responding to one is impossible, and
  // asking the graph about it fails the request, so don't offer or ask.
  const isOnGraph = isResolvableClaim(claim);

  // The response reads wait for the card to come into range.
  //
  // Three queries ride on each of these — the counts, the viewer's own indexed response, and the
  // responder faces — all keyed per claim, so nothing is shared between rows the way the match
  // lookup is. On the hub's Claims tab and the rematch picker, list surfaces that page in twenty
  // more cards at a time and previously did no response reads at all, mounting them eagerly is
  // sixty requests for claims nobody has scrolled to. `ClaimExploreFeedCard` gates its reads for
  // exactly this reason; the shared card had not caught up.
  const { ref: viewportRef, nearViewport } = useNearViewport();

  // A batch is the exception, and must not be deferred. `ClaimResponseBatchBoundary` primes these
  // very keys from one request for the whole page, so there is nothing per-card left to save — and
  // holding the hook back would mask the primed cache the batch exists to serve, drawing an empty
  // split instead of the batch's.
  const responseBatch = useClaimResponseBatchState();
  const readResponses = nearViewport || responseBatch.managed;

  // The host's ref and the observer's, on the one element. The Matches tab hangs its infinite
  // scroll sentinel off the former and popLayout measures the exiting row through it, so it cannot
  // simply be replaced.
  const setCardRef = React.useCallback(
    (node: HTMLElement | null) => {
      viewportRef(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.RefObject<HTMLElement | null>).current = node;
    },
    [ref, viewportRef]
  );

  return (
    // `w-full` matters: popLayout absolutely positions an exiting card, which would otherwise
    // collapse to its content width as it fades.
    <motion.article ref={setCardRef} {...hubCardMotion} className="w-full claim-card-panel-surface">
      {isOnGraph ? (
        <RespondableControls
          noteFor={noteFor}
          claim={claim}
          positions={positions}
          readiness={readiness}
          activeDebate={activeDebate}
          answersReady={answersReady}
          answersMayComeFromIndex={answersMayComeFromIndex}
          responseBlockedReason={responseBlockedReason}
          readResponses={readResponses}
          onOpenClaim={onOpenClaim}
          viewerIdentityPending={viewerIdentityPending}
          viewerResponseUnknown={viewerResponseUnknown}
          reconcileWithIndexedResponse={reconcileWithIndexedResponse}
          onRequireSignIn={onRequireSignIn}
          hideEndSlot={hideEndSlot}
          endSlot={endSlot}
          hasFooter={Boolean(footer)}
        />
      ) : (
        <UnresolvableControls
          positions={positions}
          readiness={readiness}
          claim={claim}
          activeDebate={activeDebate}
          onOpenClaim={onOpenClaim}
          hideEndSlot={hideEndSlot}
          endSlot={endSlot}
        />
      )}

      {footer}
    </motion.article>
  );
}

/**
 * Space chip, the end slot, and the claim itself — the chrome both control variants share.
 *
 * The meta row answers two things and no more: whose space this is, and what the claim offers the
 * reader right now. Topics used to sit here and no longer do — 15% of claims carry one, and where
 * it appears it usually restates the space chip beside it.
 *
 * The claim is set larger than the chrome around it and clamped to three lines. It is the content;
 * nothing else on the card competes. The clamp is not cosmetic: claim text runs to a median of 108
 * characters and a maximum of 222, and unclamped, one long claim sets the row height for its
 * neighbour in the topic page's two-up grid.
 */
function ClaimHeader({
  claim,
  isOnGraph,
  endSlot,
  isControversial,
  onOpenClaim,
}: {
  claim: DebateClaimSummary;
  isOnGraph: boolean;
  endSlot: React.ReactNode;
  /** Flagged beside the space chip — what kind of claim this is, which is the row's own question. */
  isControversial?: boolean;
  onOpenClaim?: () => void;
}) {
  const claimTextClassName = 'claim-card-panel-title';

  const openable = isOnGraph ? (
    onOpenClaim ? (
      <button type="button" onClick={onOpenClaim} className={`${claimTextClassName} text-left hover:underline`}>
        {claim.claim}
      </button>
    ) : (
      <Link
        href={NavUtils.toEntity(claim.space_id, claim.claim_entity_id)}
        className={`${claimTextClassName} hover:underline`}
      >
        {claim.claim}
      </Link>
    )
  ) : (
    <p className={claimTextClassName}>{claim.claim}</p>
  );

  return (
    <>
      {/* `items-start` so the chip stays put when the slot stacks a blocked reason beneath it. No
          reserved height: the slot is now the height of the chip beside it, so the row does not grow
          when the match lookup answers. */}
      <div className="claim-card-panel-header">
        <span className="flex min-w-0 items-center gap-1.5">
          <SpaceChip spaceId={claim.space_id} />
          {isControversial ? <ControversialTag /> : null}
        </span>
        {endSlot}
      </div>
      {openable}
    </>
  );
}

/**
 * The viewer's side of a claim, and everything needed to change it.
 *
 * Extracted from the card so surfaces that draw their own layout around the same controls — the
 * claim page's "Your position" block — publish responses through exactly this path rather than
 * growing a second copy of the optimistic and indexing handling below, which exists to fix bugs
 * that are not obvious from the outside.
 */
export function useClaimPositionControl({
  claim,
  positions,
  readiness,
  serverReadiness = readiness,
  answersReady = true,
  responseBlockedReason = null,
  viewerIdentityPending,
  viewerResponseUnknown,
  onRequireSignIn,
  offersDebate = true,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  /**
   * geo-chat's own answer about this viewer, or null while it has not given one.
   *
   * Only the retirement of an optimistic write reads this, and it has to: `readiness` may be the
   * merged one, whose `viewer_response` falls back to the indexed read — the same distinction
   * `useBackfillReadinessForHeldPosition` draws, for the same reason. Confirming a write against
   * that is confirming it against the client's other guess rather than against the server.
   *
   * What it cost: take a position while geo-chat was still registering a new account, the indexer
   * caught up first, the merged readiness "confirmed" the write and retired the optimism — and the
   * viewer's own avatar dropped off the side until geo-chat finally answered and put it back.
   *
   * Null rather than a readiness with a null response, because geo-chat saying "no side" and geo-chat
   * not having spoken are the same shape and opposite facts. Clearing a position is where that bites:
   * the clear would confirm against silence and retire at once, and the indexed read — which has not
   * caught up either — would then stand the viewer back up on the side they just left.
   *
   * Defaults to `readiness`, which is right for every host whose readiness *is* geo-chat's.
   */
  serverReadiness?: MatchmakingReadiness | null;
  /**
   * False while the claim's own state is still arriving.
   *
   * Two things have to have landed before a press means what it looks like it means: the vocabulary,
   * or a press publishes a stance response against a claim that wants Verify/Dispute; and the
   * viewer's own side, or the side they already hold is drawn unselected and pressing it republishes
   * instead of clearing.
   *
   * Held here rather than at each caller's `disabled`, because a pill that is unpressable while its
   * tooltip still says "Agree" is worse than one that says why. Three surfaces were adding this to
   * their own disabled condition and none of them could reach the title.
   */
  answersReady?: boolean;
  /**
   * Why responding is refused outright, or null.
   *
   * Not the same shape as `answersReady`, which means "not yet" and clears itself — this is a
   * standing condition with something the reader can do about it, so it is a sentence rather than a
   * flag and it outranks every other reason the pills might be dead.
   */
  responseBlockedReason?: string | null;
  viewerIdentityPending?: boolean;
  /**
   * Set when the host holds no answer about the viewer's side, as opposed to an answer of "none".
   *
   * `readiness.viewer_response` is `null` for both, and the difference decides whether the
   * participant lists can be corrected: with no answer they are the only account of where the viewer
   * stands, and "correcting" them means erasing the viewer from the side they hold (GEO-2807). Only
   * the rematch picker can tell the two apart — geo-chat reports `undefined` for a claim it has no
   * row for — so only it sets this.
   */
  viewerResponseUnknown?: boolean;
  /**
   * What to do when a signed-out visitor presses a side. Given one, the pills stay live while
   * signed out and pressing prompts sign-in — matching the vote arrows on an entity page. Without
   * one they stay disabled, which is what the hub's cards have always done.
   */
  onRequireSignIn?: () => void;
  /**
   * Whether this host offers the account-level match at all.
   *
   * The one thing the match is used for here is filling a side that has no faces with the people
   * the server based the offer on, so the card cannot offer a debate on a side showing nobody to
   * debate. That is only coherent where the offer is on screen.
   *
   * The rematch picker is the host it is wrong for, and it says so itself: its `positions` come
   * from a fixed pair, and it emits an empty side deliberately, because a rematch has nobody to
   * send a request to. Merging there puts an unrelated online stranger's avatar — and a `+N`
   * overflow — inside a pill that means "your opponent holds this side". False also drops the
   * lookup, which that surface has no other use for.
   */
  offersDebate?: boolean;
}) {
  const target = {
    entityId: claim.claim_entity_id,
    entityName: claim.claim,
    spaceId: claim.space_id,
    // Not `readiness.response_kind`. This target drives the *write*, and geo-chat's field can still
    // say "veracity" — which selects no SDK method, so the click throws. See `CLAIM_RESPONSE_KIND`.
    responseKind: CLAIM_RESPONSE_KIND,
  };
  const { submitResponse, isConnected, personalSpaceId } = useEntityResponse(target);
  const responseIndexing = useEntityResponseIndexingSnapshot(target);
  const resetResponseIndexing = useResetEntityResponseIndexingSnapshot(target);
  // Publishing before the personal space finishes registering fails, so wait it out the same way
  // the claim page does.
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();

  const copy = CLAIM_RESPONSE_COPY;
  const [responseError, setResponseError] = React.useState<string | null>(null);

  // The offer and the faces it implies, from one fact. Same shared query the end slot reads, so this
  // costs nothing beyond the merge.
  const { match } = useClaimMatchup({
    claimId: claim.claim_entity_id,
    spaceId: claim.space_id,
    enabled: offersDebate && isResolvableClaim(claim),
  });
  // One gate, on the lookup. `useClaimMatchup` masks a disabled match to null rather than serving
  // the shared cache another host primed, so a second check here would be unreachable — and an
  // unreachable guard is the kind that gets trusted and then quietly stops matching the real one.
  const positionsWithOpponents = React.useMemo(
    () => withMatchParticipants(positions, match?.positions),
    [match?.positions, positions]
  );

  // The client knows its own response long before geo-chat does — publishing, indexing, and then
  // the notification round trip all have to finish first. Any non-idle snapshot means we know,
  // including `indexed`; dropping back to geo-chat's copy too early is what made a successful
  // response look like it had been discarded.
  const pendingResponse = responseIndexing.status === 'idle' ? null : responseIndexing.pending;
  const optimisticPosition =
    pendingResponse?.expectedResponse == null ? null : pendingResponse.expectedResponse === 'positive';
  const viewerPosition = pendingResponse ? optimisticPosition : (readiness.viewer_response?.position ?? null);
  // Sent, and not yet seen on chain. `indexed` is past this: the chain has confirmed the write and
  // only geo-chat is still catching up, so the side drawn is a fact rather than a guess.
  const isResponsePending = responseIndexing.status === 'reconciling' || responseIndexing.status === 'delayed';

  // Already cached from the navbar, so the viewer's own avatar can join the side they picked in the
  // same frame the pill fills in — rather than after geo-chat has indexed the response and told us
  // about someone we knew about all along.
  const viewerSpaceIds = React.useMemo(() => (personalSpaceId ? [personalSpaceId] : []), [personalSpaceId]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(viewerSpaceIds);
  const viewerProfile = personalSpaceId ? profilesBySpaceId.get(personalSpaceId) : undefined;

  const optimisticPositions = React.useMemo(
    () =>
      viewerIdentityPending
        ? positionsWithOpponents
        : withViewerPosition({
            positions: positionsWithOpponents,
            // `undefined` where the host cannot say, which is not the same as "no position" — see
            // `viewerResponseUnknown`.
            serverPosition: viewerResponseUnknown ? undefined : (readiness.viewer_response?.position ?? null),
            viewerPosition,
            viewerSpaceId: personalSpaceId,
            viewerName: viewerProfile?.name ?? null,
            viewerAvatarUrl: viewerProfile?.avatarUrl ?? null,
          }),
    [
      personalSpaceId,
      positionsWithOpponents,
      readiness.viewer_response?.position,
      viewerIdentityPending,
      viewerPosition,
      viewerResponseUnknown,
      viewerProfile?.avatarUrl,
      viewerProfile?.name,
    ]
  );

  // Hand back to the server's copy only once it actually agrees, so there is no window where
  // neither side reports the response.
  React.useEffect(() => {
    if (responseIndexing.status !== 'indexed') return;
    // Nothing to hand back to yet. The viewer's own write stands until the server it was made
    // against says the same thing — see `serverReadiness`.
    if (!serverReadiness) return;
    const expected = responseIndexing.pending.expectedResponse;
    const confirmed =
      expected === null
        ? serverReadiness.viewer_response === null
        : serverReadiness.viewer_response?.position === (expected === 'positive');
    if (confirmed) resetResponseIndexing(responseIndexing.runId);
  }, [serverReadiness, resetResponseIndexing, responseIndexing]);

  const respond = (position: boolean) => {
    if (!isConnected) {
      onRequireSignIn?.();
      return;
    }
    if (isAccountSetupPending) return;
    // Ignored rather than sent. While the write is confirming, the held pill is this client's guess,
    // and pressing a held pill means "remove" — so a double-click, or a press on a side that is still
    // confirming, published a retraction nobody asked for. The request then failed with geo-chat's
    // "respond to this claim first" beside a pill that still looked held.
    if (isResponsePending) return;
    setResponseError(null);
    // A failed publish silently rolls the optimistic state back, which reads as the response
    // simply vanishing. Catch it here so the reason is visible.
    submitResponse(viewerPosition === position ? 'clear' : position ? 'positive' : 'negative', {
      onError: error =>
        setResponseError(error instanceof Error ? error.message : 'Could not publish your response. Try again.'),
    });
  };

  const actionTitle = (position: boolean) => {
    // First of all, because it is the only one with an action in it. The others describe a state
    // the reader waits out; this one names the thing they can go and do.
    if (responseBlockedReason) return responseBlockedReason;
    // Ahead of the rest: it is the only one of these the reader can do nothing about, and naming
    // the side they cannot take yet is the least useful thing to say about a dead control.
    if (!answersReady) return 'Loading this claim’s responses…';
    if (!isConnected) return copy.connect;
    if (isAccountSetupPending) return 'Finishing account setup…';
    if (isResponsePending) return RESPONSE_CONFIRMING_COPY;
    if (viewerPosition === position) return position ? copy.removePositive : copy.removeNegative;
    return responsePositionLabel(position);
  };

  return {
    viewerPosition,
    optimisticPositions,
    respond,
    actionTitle,
    responseError,
    isConnected,
    /** The viewer's response is on its way to the chain; the pills ignore presses until it lands. */
    isResponsePending,
    /**
     * False only while the account genuinely cannot publish, never while one is in flight.
     *
     * Being signed out doesn't disable the pills where a sign-in prompt was supplied: a disabled
     * control gives a visitor nothing to press and no way to learn what to do about it.
     */
    canRespond:
      (isConnected || Boolean(onRequireSignIn)) && !isAccountSetupPending && answersReady && !responseBlockedReason,
  };
}

/** The live case: the side buttons publish the viewer's on-chain response. */
function RespondableControls({
  claim,
  positions,
  readiness,
  activeDebate,
  answersReady = true,
  answersMayComeFromIndex = false,
  responseBlockedReason = null,
  readResponses = true,
  onOpenClaim,
  viewerIdentityPending,
  viewerResponseUnknown,
  reconcileWithIndexedResponse = true,
  onRequireSignIn,
  hideEndSlot,
  endSlot,
  hasFooter,
  noteFor,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: Debate | boolean | null;
  /**
   * Whether the host renders anything after these controls.
   *
   * Only the footer band cares: it bleeds past the card's padding to sit on the base, which is only
   * true when nothing follows it. The rematch picker's error alert does, and would land under a
   * band that had already claimed the bottom edge.
   */
  hasFooter?: boolean;
  answersReady?: boolean;
  /** See {@link Props.answersMayComeFromIndex}. */
  answersMayComeFromIndex?: boolean;
  responseBlockedReason?: string | null;
  /** False while the card is still far enough below the fold that its reads are not worth making. */
  readResponses?: boolean;
  /** See {@link Props.noteFor}. */
  noteFor?: (position: boolean) => React.ReactNode;
  onOpenClaim?: () => void;
  viewerIdentityPending?: boolean;
  viewerResponseUnknown?: boolean;
  /**
   * False where geo-chat's silence about the viewer's side must not be filled in from the indexed
   * response (GEO-2823). Only the rematch picker sets it: its sides are the graph's, so an answer
   * from a second source contradicts the pair it is comparing rather than completing it.
   */
  reconcileWithIndexedResponse?: boolean;
  onRequireSignIn?: () => void;
  hideEndSlot?: boolean;
  endSlot?: React.ReactNode;
}) {
  // One read for the card, and now the second half of what the card draws from. The header flags a
  // contested claim, the footer reports the split, and — since GEO-2823 — the viewer's own response
  // is reconciled against it too. Deciding any of that twice is how surfaces drift.
  //
  // Held on `answersReady` as well as proximity, because the response kind is part of both query
  // keys. Asking under the `stance` fallback does not merely waste a pair of requests on a factual
  // claim: it fetches and *draws* the stance split until the vocabulary lands, then swaps it for
  // the veracity one. Disabling the pills stops the wrong write; it does not stop the wrong number,
  // and the number is the part the reader believes.
  //
  // `answersReady` is a superset of what this strictly needs — it also waits on the viewer's own
  // side, which the counts do not depend on. That costs nothing: hosts that resolve the kind
  // through `useClaimResponseState` have already primed this exact key by then, so the extra beat
  // is a cache read, and on the hub's own tabs the rows carry their kind and it is never false.
  // Who the remembered side below is *about*. Same key every viewer-relative query in this folder
  // is scoped by, so the memory is scoped the way the reads it remembers already are.
  const { accountKey: viewerKey } = useGeoChatAuth();
  // Named, because the memory below has to know whether this read was *asked* — a disabled one
  // reports "not loading, no side", which is the shape of a settled answer and none of the fact.
  const summaryEnabled = readResponses && (answersReady || answersMayComeFromIndex);
  const summary = useClaimResponseSummary(
    claim.claim_entity_id,
    claim.space_id,
    CLAIM_RESPONSE_KIND,
    // Or where the index is allowed to answer for the side, since then the kind is the page's and
    // this read is the thing being waited *for* rather than something waiting behind it. Gating it
    // on `answersReady` there would deadlock: that flag is false precisely because geo-chat has not
    // answered, and this is what answers instead.
    summaryEnabled
  );

  /**
   * The last side the indexed read actually *settled* on, kept across its own refetches — through
   * {@link useLastSettled}, which is this exact shape and arrived with GEO-2898 while this branch
   * was in review. The reasoning below is why this card needs it; the hook is where it lives.
   *
   * Reported: take a position in the hub panel and your face appears, disappears a moment later, and
   * comes back once geo-chat catches up — which the explore card never does.
   *
   * Reading the read live is what did it. `isViewerResponseLoading` goes true again on every
   * refetch, and the substitution below was withdrawn whenever it did, so the viewer's side — and
   * the avatar standing on it — blinked out and returned on a cadence nobody asked about. It shows
   * up most on a fresh account because geo-chat, the other source, is refusing and cannot cover the
   * gap.
   *
   * Settled, emphatically, not merely last-seen: a read that comes back with no side is an answer
   * and is kept, so clearing a position still clears it. Only the window where the answer is
   * *in flight* reuses the previous one, which is the window `null` means "not yet" in.
   *
   * Only from a read that was actually asked. A disabled `useClaimResponseSummary` reports
   * `isViewerResponseLoading: false` and `indexedViewerDirection: null` — the exact shape of "asked,
   * and they hold no side" — and every card below the fold starts disabled on `readResponses`. Taken
   * as an answer that would mark the side known before anything had looked it up, and the pills
   * would go live over a side nobody knew, which is the one thing this whole path exists to prevent.
   *
   * Keyed by everything the read it remembers is keyed by: the claim, the viewer, and the response
   * kind. A remembered side belongs to the claim it was read for, to the person it was read about,
   * and to the vocabulary it was read under. The card is recycled down a virtualized list, it
   * outlives a sign-in, and a claim's kind can change under it — and each of those without its own
   * segment hands the next read's question the previous one's answer. The kind is the subtle one:
   * a stance response is not an answer about a claim that has become Verify/Dispute, and treating
   * it as one would enable the controls over it.
   */
  const claimKey = `${claim.space_id}:${claim.claim_entity_id}:${viewerKey ?? 'anon'}:${CLAIM_RESPONSE_KIND}`;
  const sideSettling = !summaryEnabled || summary.isViewerResponseLoading;
  // `'none'` rather than `null` for "settled on no side", so the two facts `null` would otherwise
  // carry stay apart: nothing held yet, against an answer of nobody. A string rather than an object
  // because `resolvedReadiness` memoizes on it, and a fresh object each render would defeat that.
  const settledDirection = useLastSettled<'positive' | 'negative' | 'none' | null>(
    sideSettling ? null : (summary.indexedViewerDirection ?? 'none'),
    sideSettling,
    claimKey
  );

  /**
   * The viewer's own side, with the indexed read standing in where geo-chat has no answer (GEO-2823).
   *
   * The optimistic snapshot is shared across surfaces, so once any of them retires it, a surface
   * reading geo-chat alone drops a side geo-chat has not caught up on. The rematch picker opts out:
   * its sides are the graph's, and geo-chat's silence there is not the same fact (GEO-2807).
   */
  const resolvedReadiness = React.useMemo(() => {
    if (!reconcileWithIndexedResponse || viewerResponseUnknown) return readiness;
    // `settledDirection` is null until this claim has settled once, which is the read still loading.
    const viewerResponse = viewerResponseWithIndexedFallback({
      viewerResponse: readiness.viewer_response,
      indexedDirection: settledDirection === 'none' ? null : settledDirection,
      isIndexedLoading: settledDirection === null,
    });
    return viewerResponse === (readiness.viewer_response ?? null)
      ? readiness
      : { ...readiness, viewer_response: viewerResponse };
  }, [readiness, reconcileWithIndexedResponse, settledDirection, viewerResponseUnknown]);

  /**
   * The side is known once *something* has answered for it — geo-chat, or the indexed read standing
   * in where the host allows it. `resolvedReadiness` above has already done the standing in; this
   * tells the gate the same thing, which otherwise goes on withholding a side the card now holds.
   */
  const sideKnown =
    answersReady || (answersMayComeFromIndex && reconcileWithIndexedResponse && settledDirection !== null);

  const { viewerPosition, optimisticPositions, respond, actionTitle, responseError, canRespond, isResponsePending } =
    useClaimPositionControl({
      claim,
      positions,
      readiness: resolvedReadiness,
      // The unmerged one, and only once geo-chat has actually answered for this claim — which is
      // exactly what `answersReady` reports, before the index is allowed to stand in for it.
      serverReadiness: answersReady ? readiness : null,
      answersReady: sideKnown,
      responseBlockedReason,
      viewerIdentityPending,
      viewerResponseUnknown,
      onRequireSignIn,
      // The faces the match implies belong with the offer the match makes. Where the slot is hidden
      // there is no offer, so there is nothing for them to be coherent with — see `offersDebate`.
      offersDebate: !hideEndSlot,
    });

  return (
    <>
      <ClaimHeader
        claim={claim}
        isOnGraph
        onOpenClaim={onOpenClaim}
        isControversial={summary.isControversial}
        endSlot={
          endSlot ??
          (hideEndSlot ? null : (
            <ClaimEndSlot
              claimId={claim.claim_entity_id}
              spaceId={claim.space_id}
              activeDebate={activeDebate}
              // `undefined` until the reads have landed, so a card that cannot yet say which side
              // the viewer holds does not read as saying they hold none.
              viewerPosition={sideKnown ? viewerPosition : undefined}
            />
          ))
        }
      />
      <PositionRow
        positions={optimisticPositions}
        responseKind={CLAIM_RESPONSE_KIND}
        viewerPosition={viewerPosition}
        onRespond={respond}
        // Not disabled while the response publishes: dimming the pills for the length of an indexing
        // round trip read as the response not having landed. Pending instead — presses are ignored,
        // because nothing serializes overlapping submissions and a second press on the held side is
        // a retraction.
        disabled={!canRespond}
        pending={isResponsePending}
        titleFor={actionTitle}
        noteFor={noteFor}
      />
      {responseError ? (
        <div role="alert" className="mt-2">
          <Text as="p" variant="footnote" color="red-01">
            {responseError}
          </Text>
        </div>
      ) : null}
      {/* Nothing at all while the reads are held, rather than the summary's own "nobody has
          answered yet" — a disabled hook reports a total of zero, and that is the absence of an
          answer rather than an answer of none. */}
      {!readResponses || summary.isLoading ? null : (
        // The card's own footer band (Figma 76081-15715): grey, full-bleed to the card's edge, with
        // the share, the split and the faces on one line. It was a rule and two stacked rows, which
        // read as more card rather than as the card's base — and the split bar, at full width above
        // its own reading, was the loudest thing on a card whose subject is the claim.
        <ClaimSummary
          entityId={claim.claim_entity_id}
          spaceId={claim.space_id}
          responseKind={CLAIM_RESPONSE_KIND}
          summary={summary}
          layout="inline"
          className={cx(
            '-mx-3 mt-3 claim-card-summary-band',
            // Only reaches the card's base when nothing follows it. A host that passes a footer —
            // the rematch picker's error alert — renders after this, and a band bled past the
            // padding would sit under it.
            !hasFooter && '-mb-3 rounded-b-[inherit]'
          )}
        />
      )}
    </>
  );
}

/**
 * Move the viewer between the two sides to match the response they just gave, before geo-chat has
 * indexed it and can report them itself.
 *
 * geo-chat's summaries are the only source of the avatar stacks, and they trail the viewer's own
 * response by a publish, an index and a notification — so without this the side you just took
 * fills in with your colour but not your face, which reads as the response not having counted.
 */
export function withViewerPosition({
  positions,
  serverPosition,
  viewerPosition,
  viewerSpaceId,
  viewerName,
  viewerAvatarUrl,
}: {
  positions: DebateClaimPositionSummary[];
  /**
   * The position geo-chat currently reports for the viewer, or `undefined` where it has not
   * answered — which is not the same as an answer of "no position". See `viewerResponseUnknown`.
   */
  serverPosition: boolean | null | undefined;
  /** The position this client knows the viewer holds. */
  viewerPosition: boolean | null;
  viewerSpaceId: string | null;
  viewerName: string | null;
  viewerAvatarUrl: string | null;
}): DebateClaimPositionSummary[] {
  // Nothing to reconcile the lists against. A `null` viewer position here would otherwise read as
  // "holds nothing" and take their face off every side, including the one the list says they hold
  // (GEO-2807) — the rematch picker draws graph-derived sides for claims geo-chat has no row for.
  if (!viewerSpaceId || serverPosition === undefined) return positions;

  // Profile space IDs may use dashed or bare-hex forms.
  const heldByViewer = (participant: DebateParticipantSummary) =>
    ID.equals(participant.profile_space_id, viewerSpaceId);

  // Participant lists may lag behind `serverPosition`, so also check for a stale viewer entry.
  const listedOnAnotherSide = positions.some(
    side => side.position !== viewerPosition && side.participants.some(heldByViewer)
  );
  // ...and they may lag behind it on the side the viewer actually holds, which is the half this
  // used to miss (GEO-2821). Agreeing about the *position* was treated as nothing left to do, so
  // the viewer's own face was left to geo-chat's presence view — and that view lists a viewer only
  // where it has a readiness row for them, which pre-GEO-2740 positions do not have until
  // something backfills one. Same viewer, same online status, face on the claims that had been
  // repaired and no face on the rest. The client knows which side it holds; assert it.
  const listedOnHeldSide =
    viewerPosition === null ||
    positions.some(side => side.position === viewerPosition && side.participants.some(heldByViewer));
  if (viewerPosition === serverPosition && !listedOnAnotherSide && listedOnHeldSide) return positions;

  const viewer = {
    // Not geo-chat's id for this user — we don't have it here. Keyed on the personal space instead,
    // which is unique per viewer and is what the avatar renders from anyway.
    user_id: `viewer:${viewerSpaceId}`,
    profile_space_id: viewerSpaceId,
    display_name: viewerName,
    avatar_cid: viewerAvatarUrl,
  };

  // Counts follow `serverPosition`, but the participant lists are rebuilt from scratch on every
  // side. Removing the viewer only from the side the server reports assumed those two agree about
  // who the viewer is; where they don't, the viewer ends up on two sides at once.
  //
  // Whether a count already includes the viewer is asked of the count's own population — the
  // participant list — rather than inferred from `serverPosition`.
  //
  // `serverPosition` is `viewer_response`, and the two are not always in step. The hub's tagged
  // rows build their sides from `online_choices`, which is presence-driven and (since GEO-2784)
  // learns a position while the write is still in flight, while `viewer_response` waits for the
  // response itself. In that window the viewer is in `participants` *and* absent from
  // `viewer_response`, so a bump keyed on `serverPosition` alone counted them twice: one face and
  // a "+1" beside it, on a side only the viewer holds. `available_now_count` is never adjusted: it
  // means "people this viewer could request", which the viewer is not and never becomes.
  //
  // `serverPosition` is only trusted to answer that where the lists agree with it. Where they put
  // the viewer on a different side, whatever built the counts counted them *there* — so the side
  // they actually hold is short by one, and taking `serverPosition`'s word for it prepended a face
  // without a number and pushed a real person out of the stack (GEO-2807).
  const countsViewer = (side: DebateClaimPositionSummary) =>
    (serverPosition === side.position && !listedOnAnotherSide) || side.participants.some(heldByViewer);

  // Both counts answered by `countsViewer`, deliberately — `participants` is a *capped* preview
  // (see `DebateOnlineChoice`), so "absent from the list" does not mean "absent from the count".
  // Asking the list about `present_count` guesses, and guesses wrong in both directions: it invents
  // a person on a side whose preview simply ran out, and after a side switch it fails to take the
  // viewer off the side they left while adding them to the new one — counting them twice.
  const withViewer = (side: DebateClaimPositionSummary): DebateClaimPositionSummary => {
    const missing = countsViewer(side) ? 0 : 1;
    return {
      ...side,
      total_count: side.total_count + missing,
      // Left undefined when the server sent none, so `presentCount` keeps falling back to the
      // face count — which the participant list below has already been adjusted for.
      present_count: side.present_count === undefined ? undefined : side.present_count + missing,
      participants: [viewer, ...side.participants.filter(participant => !heldByViewer(participant))],
    };
  };
  const withoutViewer = (side: DebateClaimPositionSummary): DebateClaimPositionSummary => {
    const counted = countsViewer(side) ? 1 : 0;
    return {
      ...side,
      total_count: Math.max(0, side.total_count - counted),
      present_count: side.present_count === undefined ? undefined : Math.max(0, side.present_count - counted),
      participants: side.participants.filter(participant => !heldByViewer(participant)),
    };
  };

  const adjusted = positions.map(side => (side.position === viewerPosition ? withViewer(side) : withoutViewer(side)));

  // A side nobody has taken yet has no summary to adjust, so the viewer would have nowhere to
  // appear. The label matches what PositionRow falls back to for a missing side.
  if (viewerPosition !== null && !adjusted.some(side => side.position === viewerPosition)) {
    adjusted.push({
      position: viewerPosition,
      position_label: responsePositionLabel(viewerPosition),
      total_count: 1,
      available_now_count: 0,
      present_count: 1,
      participants: [viewer],
    });
  }

  return adjusted;
}

/** The graph can't resolve this claim, so the sides are read-only and there's nothing to respond to. */
function UnresolvableControls({
  claim,
  positions,
  readiness,
  activeDebate,
  onOpenClaim,
  hideEndSlot,
  endSlot,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: Debate | boolean | null;
  onOpenClaim?: () => void;
  hideEndSlot?: boolean;
  endSlot?: React.ReactNode;
}) {
  return (
    <>
      <ClaimHeader
        claim={claim}
        isOnGraph={false}
        onOpenClaim={onOpenClaim}
        endSlot={
          /* The slot stays live even though the graph cannot resolve this claim, because nothing in
             it needs the graph. Both the match and the debate are geo-chat state, and the request is
             a geo-chat mutation against the very ids geo-chat handed us — so a match the server has
             already made is one the server will honour, whatever the graph makes of the id.

             It used to pass `enabled={false}`, which `useClaimMatchup` turns into `match: null`.
             That took the request control off the Matches tab for exactly the claims that are
             hardest to reach any other way: every card there is a match by definition, and the
             footer button that used to offer it is gone. Masking an action the server would accept
             is not the safe direction to be wrong in. */
          endSlot ??
          (hideEndSlot ? null : (
            <ClaimEndSlot
              claimId={claim.claim_entity_id}
              spaceId={claim.space_id}
              activeDebate={activeDebate}
              // No response control here, so there is no optimistic side to read — geo-chat's is
              // the only answer this card has about where the viewer stands, and where it is silent
              // this card genuinely does not know. Not `?? null`: on the Matches tab this readiness
              // *is* the match, and reading silence as "holds none" would contradict the match's own
              // side and take the offer off the one tab where every card is a match by definition.
              viewerPosition={readiness.viewer_response?.position}
            />
          ))
        }
      />
      <PositionRow
        positions={positions}
        responseKind={CLAIM_RESPONSE_KIND}
        viewerPosition={readiness.viewer_response?.position ?? null}
      />
      <div className="mt-3">
        <Text as="span" variant="footnote" color="grey-04">
          Claim unavailable
        </Text>
      </div>
    </>
  );
}

export function PositionRow({
  positions,
  responseKind,
  viewerPosition,
  onRespond,
  disabled,
  pending,
  titleFor,
  noteFor,
  endSlot,
}: {
  positions: DebateClaimPositionSummary[];
  responseKind: ResponseKind;
  viewerPosition: boolean | null;
  onRespond?: (position: boolean) => void;
  disabled?: boolean;
  /**
   * The viewer's response is still confirming. The pills stay at full strength — the side is drawn
   * as taken — but presses are dropped, and the buttons say so to assistive technology and, on the
   * pointer, with a wait cursor.
   */
  pending?: boolean;
  titleFor?: (position: boolean) => string;
  /**
   * Something to say under one of the two buttons — on a profile, which side
   * that person came down on.
   *
   * Under the button rather than under the row, because the row is two columns
   * and a line under the whole thing has to name its side in words. Under the
   * Agree button, "Susan agrees" needs no such help. Asked per side so the note
   * can be nothing for the other one.
   */
  noteFor?: (position: boolean) => React.ReactNode;
  /** A compact third action, kept beside both positions at narrow and wide card widths. */
  endSlot?: React.ReactNode;
}) {
  const copy = CLAIM_RESPONSE_COPY;
  const forSide = positions.find(position => position.position === true);
  const againstSide = positions.find(position => position.position === false);

  // Two across where there is room for both labels whole, stacked where there is not.
  //
  // The pills are rendered in a feed card, a side panel and the claim page, at widths none of them
  // agrees on, so the row cannot ask the viewport how much space it has — a 1200px window says
  // nothing about a 230px panel inside it. `@container` makes the question local: `claim-pills-wide`
  // reads this row's own width wherever it has been dropped, and styles.css carries the threshold
  // and how it was measured. Stacking rather than clipping is the point: the label is the only part
  // of a pill allowed to shrink, which is how a button came to read "Dis..." (GEO-2774).
  //
  // A compact end slot is the claim-list exception: the Figma row deliberately groups all three
  // actions, and its two flexible position columns can shed responder faces before their labels
  // run out of room. Keep that row three columns at every card width instead of letting the nested
  // PositionRow stack while the comments pill remains stranded beside it.
  return (
    <div className="@container">
      <div
        className={cx(
          'grid gap-2',
          endSlot ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]' : 'grid-cols-1 claim-pills-wide:grid-cols-2'
        )}
      >
        {/* The note shares its button's grid cell rather than sitting in one of
            its own, which is what keeps the two arrangements honest: stacked, it
            follows the button it belongs to instead of both buttons; side by
            side, it sits in that button's column.

            `flex flex-col` and not a bare `div`: a grid item stretches to its
            column, but a *block* child of one does not pass that width on, and
            the pill sizes itself from its content — so wrapping it collapsed
            both buttons to their icons, the label truncating to nothing inside
            `min-w-0`. A flex column stretches its children by default, which is
            the width the pill had as a grid item. */}
        <div className="flex flex-col">
          <PositionButton
            // This app's vocabulary, not the server's. A side's `position_label` used to win where
            // it had one, which would now let geo-chat print "Verify" on a claim minted before the
            // vocabularies merged — a word this app has no way to publish any more.
            label={copy.positiveAction}
            summary={forSide}
            responseKind={responseKind}
            position
            selected={viewerPosition === true}
            onRespond={onRespond}
            disabled={disabled}
            pending={pending}
            title={titleFor?.(true)}
          />
          {noteFor?.(true)}
        </div>
        <div className="flex flex-col">
          <PositionButton
            label={copy.negativeAction}
            summary={againstSide}
            responseKind={responseKind}
            position={false}
            selected={viewerPosition === false}
            onRespond={onRespond}
            disabled={disabled}
            pending={pending}
            title={titleFor?.(false)}
          />
          {noteFor?.(false)}
        </div>
        {endSlot ? <div className="flex h-7 shrink-0 items-center">{endSlot}</div> : null}
      </div>
    </div>
  );
}

export function SpaceChip({ spaceId }: { spaceId: string }) {
  // Same resolution as the space filter above the list, so a card and the menu option naming its
  // space are never one loaded and the other still reading "Space".
  const { labelsById, isLoading } = useSpaceLabels(
    React.useMemo(() => (validateSpaceId(spaceId) ? [spaceId] : []), [spaceId])
  );
  const label = spaceLabel(labelsById, spaceId);
  const name = label?.name ?? 'Space';
  const image = label?.image ?? null;

  // A whole list of cards eyebrowed "Space" reads as though every claim lives somewhere called
  // Space. A skeleton says the name is coming, and holds the line's height while it does.
  if (!label && isLoading) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Skeleton className="h-3 w-20" aria-label="Loading space name" />
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {image ? (
        <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-sm">
          <ThumbGeoImage value={image} alt="" />
        </span>
      ) : null}
      <span className="truncate text-footnoteMedium text-grey-04">{name}</span>
    </span>
  );
}

function PositionButton({
  label,
  summary,
  responseKind,
  position,
  selected,
  onRespond,
  disabled,
  pending,
  title,
}: {
  label: string;
  summary: DebateClaimPositionSummary | undefined;
  responseKind: ResponseKind;
  position: boolean;
  selected: boolean;
  onRespond?: (position: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
  title?: string;
}) {
  // `@container` so the avatar stack can measure the pill it is sitting in — see `PositionAvatars`,
  // which sheds faces rather than letting the label truncate.
  // Grey when held, a dashed outline when not (the Figma card). The side you picked used to be
  // green or red, which made the pill argue the position as well as record it — and put white-ish
  // text on two saturated fills that nothing else in the product uses this way. Which side is
  // yours is said by the fill (and, on a stance claim, the filled thumb); which side is *which* is
  // said by the summary bar below, where the colours still mean something.
  //
  // `border` on both states, transparent when held, so picking a side cannot change the pill's
  // width and shuffle the row.
  //
  // `divider` (#F0F0F0) and not `grey-01` (#F6F6F6): the card's footer band is the lighter of the
  // two and these sit directly above it, so using one grey for both flattens the pill into the
  // band. Figma names this colour "Secondary/Line dividers", which is the same name this token
  // already has — the two systems agree, and the pill borrows it rather than inventing a shade.
  const className = cx(
    '@container flex min-h-7 items-center justify-center rounded-full border px-3 text-button text-text',
    selected ? 'border-transparent bg-divider' : 'border-dashed border-grey-03 bg-white'
  );
  // Icon, label and faces are one centred group at a single 6px gap, per the Figma card. They used
  // to be two groups pushed to opposite ends by `justify-between`, which left the faces adrift at
  // the far edge of a wide pill instead of reading as part of the label they belong to.
  const content = (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* Thumbs for a stance, chevrons for a factual claim — see `ResponsePositionIcon`. Filled,
          where the glyph has a filled form, so the pill reads as taken even in a screenshot; a
          chevron has none, and leans on the pill's own fill below. */}
      <span className="shrink-0">
        <ResponsePositionIcon responseKind={responseKind} position={position} selected={selected} />
      </span>
      <span className="truncate">
        {label}
        {selected ? <span className="sr-only"> — your response</span> : null}
      </span>
      {summary && presentCount(summary) > 0 ? (
        <PositionAvatars summary={summary} ringClassName={selected ? 'border-divider' : 'border-white'} />
      ) : null}
    </span>
  );

  if (!onRespond) return <div className={className}>{content}</div>;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={pending || undefined}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (!pending) onRespond(position);
      }}
      className={cx(
        className,
        'transition-colors disabled:opacity-60',
        // The only sign the press was taken: the pill drops presses for the 10-50s a response
        // spends confirming, and nothing else on the page says so. The copy that used to sit
        // under the pills read as an unsettled side, so the cue stays on the pointer.
        pending && 'cursor-progress',
        !selected && !disabled && !pending && 'hover:border-text'
      )}
    >
      {content}
    </button>
  );
}

/**
 * The population the avatar stack is drawn from.
 *
 * `present_count` is optional only because geo-chat began sending it in geo-chat#74 and the two
 * halves deploy independently. Falling back to the number of faces actually supplied is the safe
 * reading in that window: it renders every face geo-chat sent and claims no hidden extras, whereas
 * reading the field directly would gate the stack on `undefined > 0` and draw nothing — the bug
 * this whole change exists to fix, reintroduced by a deploy ordering.
 */
export function presentCount(summary: Pick<DebateClaimPositionSummary, 'present_count' | 'participants'>): number {
  return summary.present_count ?? summary.participants.length;
}

/**
 * The stack answers one question: who is here on this position, available to debate, right now.
 *
 * GEO-2691, and the count is the half that kept going wrong. It was `total_count - shown`, which
 * counted offline holders under a control whose whole meaning is availability — a side with nobody
 * available rendered a bare "+2" and no avatars. Then it was `available_now_count - shown`, which
 * is viewer-relative: it excludes the viewer and anyone they have already debated on this claim, so
 * a claim you had actually argued showed you an empty stack.
 *
 * `present_count` is the population geo-chat draws `participants` from, so the faces and the count
 * beside them describe the same people, and describe the same people for every viewer.
 * `total_count` is left alone — it answers "who holds this position", which the card does not show.
 */
/**
 * Largest remainder the badge will print.
 *
 * The badge is `min-w-4` with no padding — a circle the size of a face, 16px of content in a 2px
 * ring — and 8px type keeps "+99" (about 14px) inside that floor. The shedding rules below are
 * written against that fixed width, so an uncapped count would widen a `shrink-0` stack and start
 * taking width back off the label, which is the whole thing they exist to prevent. Capping here
 * rather than widening the rule keeps the badge one size for every claim instead of sizing all of
 * them for a crowd that almost never turns up. `overflow-hidden` is the backstop if this cap is
 * ever raised.
 *
 * Understating is safe: the stack is `aria-hidden`, decorative beside a count the row states
 * exactly, and a badge that reads "and at least this many more" is the convention anyway.
 */
const MAX_OVERFLOW_SHOWN = 99;

function PositionAvatars({
  summary,
  ringClassName = 'border-white',
}: {
  summary: DebateClaimPositionSummary;
  /** The pill's own background, so the dot's ring reads as a hole punched in it rather than a rim. */
  ringClassName?: string;
}) {
  const participants = summary.participants.slice(0, 2);
  const overflow = Math.max(0, presentCount(summary) - participants.length);

  // The stack sheds pieces as the pill narrows, so the label never has to.
  //
  // The stack is `shrink-0` and the label is not, so any shortfall used to come out of the word:
  // "Disagree" became "Dis..." on exactly the claims that have people to show. Sizing the row for a
  // full stack instead would stack the pills on every claim to protect the rare crowded one, so the
  // faces give way rather than the layout.
  //
  // These thresholds are against the pill's *content* box, which is what a container query measures
  // — 24px of `px-3` is already excluded, so they read 24px smaller than the pill widths they
  // correspond to. Inside that box sit the label group (a 12px icon, a 6px gap and 58px of
  // "Disagree" = 76px) and the 6px gap before the stack. A face is a 16px picture in a 2px ring
  // outside it — 20px of box — pitched 13px apart, so the first costs 20px and each one after it
  // 13px, the badge likewise: 102px holds one face, 115px holds two, 128px holds the lot. These are
  // deliberately a few pixels loose rather than exact, because erring toward shedding a face early
  // is the safe direction — the failure they exist to prevent is the label truncating to "Dis...".
  // The badge only fits that budget because `MAX_OVERFLOW_SHOWN` keeps its text inside the
  // `min-w-4` floor; without that cap it grows and this stops holding.
  //
  // These were 108/124/148 against 24px faces and an 8px gap. Both changed together: the faces
  // shrank to match the explore card's, and merging the pill's two groups into one centred run
  // took the gap to 6px. Anything that moves a face size, a ring, an overlap or that gap moves
  // these three numbers with it.
  //
  // The badge goes first and a face last, because the faces stay truthful as they are dropped: the
  // count is computed against the participants rendered, so hiding a face would leave a "+N" that
  // no longer adds up, while hiding the badge only stops advertising a remainder.
  return (
    // `-7px`, not Figma's `-3px`. Figma's stroke is drawn outside the node and does not lay out, so
    // its faces are 16px apart less 3px = a 13px pitch. A CSS border *does* lay out, so a face here
    // is 20px wide and needs -7px to land that same 13px pitch. Copying the -3px across was the bug:
    // same number, box 4px wider, four pixels of overlap lost per face.
    <span aria-hidden="true" className="flex shrink-0 items-center -space-x-[7px]">
      {participants.map((participant, index) => (
        <span
          key={participant.user_id}
          className={cx(
            // The picture stays 16px and the ring sits outside it, which is what Figma draws: the
            // ring's job is to cut the face behind, so it has to be *over* that face rather than
            // inside its own. 11px of a 16px face shows before the next one's ring bites into it.
            'relative box-content block size-4 rounded-full border-2',
            // Figma leaves the ring off the leading face, which overlaps nothing. Transparent
            // rather than absent, so every face keeps identical geometry: a ring that is not drawn
            // must not also change the size of the thing it is not drawn on.
            index === 0 ? 'border-transparent' : ringClassName,
            index === 0 ? '@max-[102px]:hidden' : '@max-[115px]:hidden'
          )}
        >
          {/* Matches the picture, which `box-content` keeps at a full 16px whether or not the face
              carries a ring — so every face is the same size and sits on one baseline. The clip is
              here rather than on the wrapper so the dot can hang over the rim without being cut. */}
          <span className="block size-4 overflow-hidden rounded-full">
            <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={16} />
          </span>
          {/* Everyone in this stack is present by construction — the sides are built from
              `online_choices` — so the dot needs no condition. It rings in the pill's own colour
              rather than white, which is the surface actually behind it here. */}
          {/* Sized and placed from the 16px face: 4px of green in a 2px ring, sitting on the
              picture's top-left corner with the ring bleeding outside it. Those numbers are
              `OnlineDot`'s to derive now — the People tab needed the same proportions on a 32px
              face and two hand-written copies had already drifted. */}
          <OnlineDot faceSize={16} ringClassName={ringClassName} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={cx(
            // A circle the size of a face, which is what Figma draws and what the stack read as
            // before: `px-1` made it a wide pill sitting beside two small circles. `min-w-4` with
            // no padding keeps it round — "+99", the most `MAX_OVERFLOW_SHOWN` allows, is about
            // 14px of 8px type and still fits inside the 16px floor.
            'relative box-content flex h-4 min-w-4 items-center justify-center overflow-hidden rounded-full border-2 bg-grey-02 text-[8px] leading-4 text-grey-04 tabular-nums @max-[128px]:hidden',
            ringClassName
          )}
        >
          +{Math.min(overflow, MAX_OVERFLOW_SHOWN)}
        </span>
      )}
    </span>
  );
}
