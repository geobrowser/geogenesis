'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';

import { ClaimEndSlot } from '~/core/claims/browse/claim-end-slot';
import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSummary, ControversialTag } from '~/core/claims/browse/claim-summary';
import { useClaimMatchup, withMatchParticipants } from '~/core/claims/browse/use-claim-matchup';
import {
  useEntityResponse,
  useEntityResponseIndexingSnapshot,
  useResetEntityResponseIndexingSnapshot,
} from '~/core/hooks/use-entity-vote';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { NavUtils, validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type {
  Debate,
  DebateClaimPositionSummary,
  DebateClaimSummary,
  DebateParticipantSummary,
  MatchmakingReadiness,
} from '../api';
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
  /** Why responding is refused outright — an unpublished edit to the claim's own vocabulary. */
  responseBlockedReason?: string | null;
  /** Rendered under the summary, for hosts with something extra to say. */
  footer?: React.ReactNode;
  /**
   * Leaves the end slot out.
   *
   * For the one host whose offer is not the card's offer: the rematch picker sends a rematch
   * request, its own mutation with its own gating, from a control in its footer. A slot offering
   * `Request debate` above it would be a different button wearing the same words.
   */
  hideEndSlot?: boolean;
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
  responseBlockedReason,
  footer,
  onOpenClaim,
  viewerIdentityPending,
  viewerResponseUnknown,
  onRequireSignIn,
  hideEndSlot,
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
    <motion.article
      ref={setCardRef}
      {...hubCardMotion}
      className="w-full rounded-lg border border-grey-02 bg-white p-3"
    >
      {isOnGraph ? (
        <RespondableControls
          claim={claim}
          positions={positions}
          readiness={readiness}
          activeDebate={activeDebate}
          answersReady={answersReady}
          responseBlockedReason={responseBlockedReason}
          readResponses={readResponses}
          onOpenClaim={onOpenClaim}
          viewerIdentityPending={viewerIdentityPending}
          viewerResponseUnknown={viewerResponseUnknown}
          onRequireSignIn={onRequireSignIn}
          hideEndSlot={hideEndSlot}
        />
      ) : (
        <UnresolvableControls
          positions={positions}
          readiness={readiness}
          claim={claim}
          activeDebate={activeDebate}
          onOpenClaim={onOpenClaim}
          hideEndSlot={hideEndSlot}
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
  const claimTextClassName = 'mb-3 block text-metadataMedium leading-snug text-pretty line-clamp-3';

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
      <div className="mb-2 flex items-start justify-between gap-3">
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
    spaceId: claim.space_id,
    responseKind: readiness.response_kind,
  };
  const { submitResponse, isConnected, personalSpaceId } = useEntityResponse(target);
  const responseIndexing = useEntityResponseIndexingSnapshot(target);
  const resetResponseIndexing = useResetEntityResponseIndexingSnapshot(target);
  // Publishing before the personal space finishes registering fails, so wait it out the same way
  // the claim page does.
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();

  const copy = ENTITY_RESPONSE_COPY[readiness.response_kind];
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
            responseKind: readiness.response_kind,
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
      readiness.response_kind,
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
    const expected = responseIndexing.pending.expectedResponse;
    const confirmed =
      expected === null
        ? readiness.viewer_response === null
        : readiness.viewer_response?.position === (expected === 'positive');
    if (confirmed) resetResponseIndexing(responseIndexing.runId);
  }, [readiness.viewer_response, resetResponseIndexing, responseIndexing]);

  const respond = (position: boolean) => {
    if (!isConnected) {
      onRequireSignIn?.();
      return;
    }
    if (isAccountSetupPending) return;
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
    if (viewerPosition === position) return position ? copy.removePositive : copy.removeNegative;
    return position ? copy.positiveAction : copy.negativeAction;
  };

  return {
    viewerPosition,
    optimisticPositions,
    respond,
    actionTitle,
    responseError,
    /** Exposed so a request offer can name a late index differently from a publish in flight. */
    responseIndexing,
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
  responseBlockedReason = null,
  readResponses = true,
  onOpenClaim,
  viewerIdentityPending,
  viewerResponseUnknown,
  onRequireSignIn,
  hideEndSlot,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: Debate | boolean | null;
  answersReady?: boolean;
  responseBlockedReason?: string | null;
  /** False while the card is still far enough below the fold that its reads are not worth making. */
  readResponses?: boolean;
  onOpenClaim?: () => void;
  viewerIdentityPending?: boolean;
  viewerResponseUnknown?: boolean;
  onRequireSignIn?: () => void;
  hideEndSlot?: boolean;
}) {
  const {
    viewerPosition,
    optimisticPositions,
    respond,
    actionTitle,
    responseError,
    canRespond,
    responseIndexing,
  } = useClaimPositionControl({
    claim,
    positions,
    readiness,
      answersReady,
      responseBlockedReason,
      viewerIdentityPending,
      viewerResponseUnknown,
      onRequireSignIn,
      // The faces the match implies belong with the offer the match makes. Where the slot is hidden
      // there is no offer, so there is nothing for them to be coherent with — see `offersDebate`.
      offersDebate: !hideEndSlot,
    });
  // One read for the card. The header flags a contested claim and the footer reports the split, and
  // deciding that twice is how the two would eventually disagree.
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
  const summary = useClaimResponseSummary(
    claim.claim_entity_id,
    claim.space_id,
    readiness.response_kind,
    readResponses && answersReady
  );

  return (
    <>
      <ClaimHeader
        claim={claim}
        isOnGraph
        onOpenClaim={onOpenClaim}
        isControversial={summary.isControversial}
        endSlot={
          hideEndSlot ? null : (
            <ClaimEndSlot
              claimId={claim.claim_entity_id}
              spaceId={claim.space_id}
              activeDebate={activeDebate}
              position={{
                chat: readiness.viewer_response?.position ?? null,
                local: viewerPosition,
                indexingDelayed: responseIndexing.status === 'delayed',
              }}
            />
          )
        }
      />
      <PositionRow
        positions={optimisticPositions}
        responseKind={readiness.response_kind}
        viewerPosition={viewerPosition}
        onRespond={respond}
        // Deliberately not disabled while the response publishes. `useEntityResponse` serializes
        // overlapping submissions, so there is nothing to protect against — and dimming the pills
        // for the length of an indexing round trip read as the response not having landed.
        disabled={!canRespond}
        titleFor={actionTitle}
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
        <ClaimSummary
          entityId={claim.claim_entity_id}
          spaceId={claim.space_id}
          responseKind={readiness.response_kind}
          summary={summary}
          className="mt-3 border-t border-divider pt-3"
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
  responseKind,
  serverPosition,
  viewerPosition,
  viewerSpaceId,
  viewerName,
  viewerAvatarUrl,
}: {
  positions: DebateClaimPositionSummary[];
  responseKind: MatchmakingReadiness['response_kind'];
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
  if (viewerPosition === serverPosition && !listedOnAnotherSide) return positions;

  const copy = ENTITY_RESPONSE_COPY[responseKind];
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
      position_label: viewerPosition ? copy.positiveAction : copy.negativeAction,
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
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: Debate | boolean | null;
  onOpenClaim?: () => void;
  hideEndSlot?: boolean;
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
          hideEndSlot ? null : (
            <ClaimEndSlot
              claimId={claim.claim_entity_id}
              spaceId={claim.space_id}
              activeDebate={activeDebate}
              // This card draws no response control, so it has no optimistic side of its own and
              // both readings are geo-chat's. That is not the self-comparison GEO-2808 removed —
              // there the fallback was the *graph*, a different source from the one that validates
              // the request. Here it is the validating source agreeing with itself, which is the
              // honest answer to "does geo-chat hold a position for this viewer".
              position={{
                chat: readiness.viewer_response?.position ?? null,
                local: readiness.viewer_response?.position ?? null,
              }}
            />
          )
        }
      />
      <PositionRow
        positions={positions}
        responseKind={readiness.response_kind}
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
  titleFor,
}: {
  positions: DebateClaimPositionSummary[];
  responseKind: MatchmakingReadiness['response_kind'];
  viewerPosition: boolean | null;
  onRespond?: (position: boolean) => void;
  disabled?: boolean;
  titleFor?: (position: boolean) => string;
}) {
  const copy = ENTITY_RESPONSE_COPY[responseKind];
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
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-2 claim-pills-wide:grid-cols-2">
        <PositionButton
          // Server labels win when a side has responders; otherwise fall back to the vocabulary for
          // this response kind — Agree/Disagree, or Verify/Dispute for a factual claim.
          label={forSide?.position_label ?? copy.positiveAction}
          summary={forSide}
          position
          selected={viewerPosition === true}
          onRespond={onRespond}
          disabled={disabled}
          title={titleFor?.(true)}
        />
        <PositionButton
          label={againstSide?.position_label ?? copy.negativeAction}
          summary={againstSide}
          position={false}
          selected={viewerPosition === false}
          onRespond={onRespond}
          disabled={disabled}
          title={titleFor?.(false)}
        />
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
  position,
  selected,
  onRespond,
  disabled,
  title,
}: {
  label: string;
  summary: DebateClaimPositionSummary | undefined;
  position: boolean;
  selected: boolean;
  onRespond?: (position: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  // `@container` so the avatar stack can measure the pill it is sitting in — see `PositionAvatars`,
  // which sheds faces rather than letting the label truncate.
  const className = cx(
    '@container flex min-h-7 items-center justify-between gap-2 rounded-full px-3 text-button text-text',
    selected ? (position ? 'bg-green' : 'bg-red-01') : 'bg-grey-01'
  );
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {/* Filled once it's the side you hold, so the pill reads as taken even in a screenshot. */}
        <span className="shrink-0">{position ? <ThumbUp filled={selected} /> : <ThumbDown filled={selected} />}</span>
        <span className="truncate">
          {label}
          {selected ? <span className="sr-only"> — your response</span> : null}
        </span>
      </span>
      {summary && presentCount(summary) > 0 ? <PositionAvatars summary={summary} /> : null}
    </>
  );

  if (!onRespond) return <div className={className}>{content}</div>;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={() => onRespond(position)}
      className={cx(className, 'transition-colors disabled:opacity-60', !selected && !disabled && 'hover:bg-grey-01')}
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
 * The badge is `min-w-5` with `px-1`, so it sits at exactly 32px until its text outgrows that
 * floor — measured, that happens between "+99" (32px) and "+100" (34.9px). The shedding rules below
 * are written against a 32px badge, so an uncapped count would widen a `shrink-0` stack and start
 * taking width back off the label, which is the whole thing they exist to prevent. Capping here
 * rather than widening the rule keeps the badge a fixed size for every claim instead of sizing all
 * of them for a crowd that almost never turns up.
 *
 * Understating is safe: the stack is `aria-hidden`, decorative beside a count the row states
 * exactly, and a badge that reads "and at least this many more" is the convention anyway.
 */
const MAX_OVERFLOW_SHOWN = 99;

function PositionAvatars({ summary }: { summary: DebateClaimPositionSummary }) {
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
  // "Disagree" = 76px) and the 8px gap before the stack. A face is 24px, a second adds 16px after
  // the 8px overlap, and the badge adds another 24px: 108px holds one face, 124px holds two, 148px
  // holds the lot. 108px is `claim-pills-wide` seen from inside a pill, which is where that
  // threshold came from. The badge is 24px only because `MAX_OVERFLOW_SHOWN` keeps its text inside
  // the `min-w-5` floor — without that cap it grows and the arithmetic here stops holding.
  //
  // The badge goes first and a face last, because the faces stay truthful as they are dropped: the
  // count is computed against the participants rendered, so hiding a face would leave a "+N" that
  // no longer adds up, while hiding the badge only stops advertising a remainder.
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center -space-x-2">
      {participants.map((participant, index) => (
        <span
          key={participant.user_id}
          className={cx(
            'relative box-content block size-5 overflow-hidden rounded-full border-2 border-white',
            index === 0 ? '@max-[108px]:hidden' : '@max-[124px]:hidden'
          )}
        >
          <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
        </span>
      ))}
      {overflow > 0 && (
        <span className="relative box-content flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-grey-02 px-1 text-[11px] leading-5 text-grey-04 tabular-nums @max-[148px]:hidden">
          +{Math.min(overflow, MAX_OVERFLOW_SHOWN)}
        </span>
      )}
    </span>
  );
}
