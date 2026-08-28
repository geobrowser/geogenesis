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
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
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
  /** Rendered under the summary, for hosts with something extra to say. */
  footer?: React.ReactNode;
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
  footer,
  onOpenClaim,
  viewerIdentityPending,
  onRequireSignIn,
  ref,
}: Props) {
  // geo-chat can hand back a claim the graph has never seen. Responding to one is impossible, and
  // asking the graph about it fails the request, so don't offer or ask.
  const isOnGraph = isResolvableClaim(claim);

  return (
    // `w-full` matters: popLayout absolutely positions an exiting card, which would otherwise
    // collapse to its content width as it fades.
    <motion.article ref={ref} {...hubCardMotion} className="w-full rounded-lg border border-grey-02 bg-white p-3">
      {isOnGraph ? (
        <RespondableControls
          claim={claim}
          positions={positions}
          readiness={readiness}
          activeDebate={activeDebate}
          onOpenClaim={onOpenClaim}
          viewerIdentityPending={viewerIdentityPending}
          onRequireSignIn={onRequireSignIn}
        />
      ) : (
        <UnresolvableControls
          positions={positions}
          readiness={readiness}
          claim={claim}
          activeDebate={activeDebate}
          onOpenClaim={onOpenClaim}
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
      {/* `items-start` so the chip stays put when the slot stacks a blocked reason beneath it, and
          `min-h-7` so the row is already the height of the offer before the match lookup answers —
          otherwise the card grows a line under anyone who has started reading it. */}
      <div className="mb-2 flex min-h-7 items-start justify-between gap-3">
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
  viewerIdentityPending,
  onRequireSignIn,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  viewerIdentityPending?: boolean;
  /**
   * What to do when a signed-out visitor presses a side. Given one, the pills stay live while
   * signed out and pressing prompts sign-in — matching the vote arrows on an entity page. Without
   * one they stay disabled, which is what the hub's cards have always done.
   */
  onRequireSignIn?: () => void;
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
    enabled: isResolvableClaim(claim),
  });
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
            serverPosition: readiness.viewer_response?.position ?? null,
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
    /**
     * False only while the account genuinely cannot publish, never while one is in flight.
     *
     * Being signed out doesn't disable the pills where a sign-in prompt was supplied: a disabled
     * control gives a visitor nothing to press and no way to learn what to do about it.
     */
    canRespond: (isConnected || Boolean(onRequireSignIn)) && !isAccountSetupPending,
  };
}

/** The live case: the side buttons publish the viewer's on-chain response. */
function RespondableControls({
  claim,
  positions,
  readiness,
  activeDebate,
  onOpenClaim,
  viewerIdentityPending,
  onRequireSignIn,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: Debate | boolean | null;
  onOpenClaim?: () => void;
  viewerIdentityPending?: boolean;
  onRequireSignIn?: () => void;
}) {
  const { viewerPosition, optimisticPositions, respond, actionTitle, responseError, canRespond } =
    useClaimPositionControl({ claim, positions, readiness, viewerIdentityPending, onRequireSignIn });
  // One read for the card. The header flags a contested claim and the footer reports the split, and
  // deciding that twice is how the two would eventually disagree.
  const summary = useClaimResponseSummary(claim.claim_entity_id, claim.space_id, readiness.response_kind);

  return (
    <>
      <ClaimHeader
        claim={claim}
        isOnGraph
        onOpenClaim={onOpenClaim}
        isControversial={summary.isControversial}
        endSlot={<ClaimEndSlot claimId={claim.claim_entity_id} spaceId={claim.space_id} activeDebate={activeDebate} />}
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
      {summary.isLoading ? null : (
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
  /** The position geo-chat currently reports for the viewer. */
  serverPosition: boolean | null;
  /** The position this client knows the viewer holds. */
  viewerPosition: boolean | null;
  viewerSpaceId: string | null;
  viewerName: string | null;
  viewerAvatarUrl: string | null;
}): DebateClaimPositionSummary[] {
  if (!viewerSpaceId || viewerPosition === serverPosition) return positions;

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const viewer = {
    // Not geo-chat's id for this user — we don't have it here. Keyed on the personal space instead,
    // which is unique per viewer and is what the avatar renders from anyway.
    user_id: `viewer:${viewerSpaceId}`,
    profile_space_id: viewerSpaceId,
    display_name: viewerName,
    avatar_cid: viewerAvatarUrl,
  };

  // `ID.equals` rather than `===`: `viewerSpaceId` is a graph id, which is always bare hex, while
  // geo-chat ids are treated as possibly dashed throughout this directory. A raw comparison against
  // a dashed `profile_space_id` silently fails to match, which would leave the viewer drawn on both
  // sides at once — the count decrements either way.
  const heldByViewer = (participant: DebateParticipantSummary) =>
    ID.equals(participant.profile_space_id, viewerSpaceId);

  // Counts follow `serverPosition`, but the participant lists are rebuilt from scratch on every
  // side. Removing the viewer only from the side the server reports assumed those two agree about
  // who the viewer is; where they don't, the viewer ends up on two sides at once.
  // `present_count` and `total_count` both already include the viewer once geo-chat reports their
  // position, so both are adjusted only while it does not. `available_now_count` is never adjusted:
  // it means "people this viewer could request", which the viewer is not and never becomes.
  const withViewer = (side: DebateClaimPositionSummary): DebateClaimPositionSummary => ({
    ...side,
    total_count: side.total_count + (serverPosition === side.position ? 0 : 1),
    // Left undefined when the server sent none, so `presentCount` keeps falling back to the
    // face count — which the participant list below has already been adjusted for.
    present_count:
      side.present_count === undefined ? undefined : side.present_count + (serverPosition === side.position ? 0 : 1),
    participants: [viewer, ...side.participants.filter(participant => !heldByViewer(participant))],
  });
  const withoutViewer = (side: DebateClaimPositionSummary): DebateClaimPositionSummary => ({
    ...side,
    total_count: Math.max(0, side.total_count - (serverPosition === side.position ? 1 : 0)),
    present_count:
      side.present_count === undefined
        ? undefined
        : Math.max(0, side.present_count - (serverPosition === side.position ? 1 : 0)),
    participants: side.participants.filter(participant => !heldByViewer(participant)),
  });

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
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: Debate | boolean | null;
  onOpenClaim?: () => void;
}) {
  return (
    <>
      <ClaimHeader
        claim={claim}
        isOnGraph={false}
        onOpenClaim={onOpenClaim}
        endSlot={
          /* A live debate is geo-chat state, so it can still be watched without a graph id — but
             the graph cannot resolve this claim, so there is no match to request against it. */
          <ClaimEndSlot
            claimId={claim.claim_entity_id}
            spaceId={claim.space_id}
            activeDebate={activeDebate}
            enabled={false}
          />
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

  return (
    <div className="grid grid-cols-2 gap-2">
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
  const className = cx(
    'flex min-h-7 items-center justify-between gap-2 rounded-full px-3 text-button text-text',
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
function PositionAvatars({ summary }: { summary: DebateClaimPositionSummary }) {
  const participants = summary.participants.slice(0, 2);
  const overflow = Math.max(0, presentCount(summary) - participants.length);

  return (
    <span aria-hidden="true" className="flex shrink-0 items-center -space-x-2">
      {participants.map(participant => (
        <span
          key={participant.user_id}
          className="relative box-content block size-5 overflow-hidden rounded-full border-2 border-white"
        >
          <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
        </span>
      ))}
      {overflow > 0 && (
        <span className="relative box-content flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-grey-02 px-1 text-[11px] leading-5 text-grey-04 tabular-nums">
          +{overflow}
        </span>
      )}
    </span>
  );
}
