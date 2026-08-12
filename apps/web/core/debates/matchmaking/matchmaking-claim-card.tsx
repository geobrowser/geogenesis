'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';

import {
  useEntityResponse,
  useEntityResponseIndexingSnapshot,
  useResetEntityResponseIndexingSnapshot,
} from '~/core/hooks/use-entity-vote';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { NavUtils, validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';
import { Text } from '~/design-system/text';

import type { DebateClaimPositionSummary, DebateClaimSummary, MatchmakingReadiness } from '../api';
import { ClaimReadinessToggle } from './claim-readiness-toggle';
import { hubCardMotion } from './hub-motion';

type Props = {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  /** Drives the response buttons and the readiness toggle. */
  readiness: MatchmakingReadiness;
  activeDebate?: boolean;
  /** Rendered under the controls — e.g. the Matches tab's "Request debate" button. */
  footer?: React.ReactNode;
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
 * Taking a side is an on-chain claim response, so the two side buttons are the only way to do it —
 * there are deliberately no separate vote arrows here. Readiness, the geo-chat half, rides
 * alongside them.
 */
export function MatchmakingClaimCard({ claim, positions, readiness, activeDebate, footer, ref }: Props) {
  // geo-chat can hand back a claim the graph has never seen. Responding to one is impossible, and
  // asking the graph about it fails the request, so don't offer or ask.
  const isOnGraph = isResolvableClaim(claim);

  return (
    // `w-full` matters: popLayout absolutely positions an exiting card, which would otherwise
    // collapse to its content width as it fades.
    <motion.article ref={ref} {...hubCardMotion} className="w-full rounded-lg border border-grey-02 bg-white p-3">
      {isOnGraph ? (
        <RespondableControls claim={claim} positions={positions} readiness={readiness} activeDebate={activeDebate} />
      ) : (
        <UnresolvableControls positions={positions} readiness={readiness} claim={claim} activeDebate={activeDebate} />
      )}

      {footer}
    </motion.article>
  );
}

/**
 * Space chip, readiness toggle, and the claim itself — the chrome both control variants share.
 * The toggle rides in the header's top right per the design, but whether it can be turned on
 * depends on response state only the respondable variant tracks, so each passes its own.
 */
function ClaimHeader({
  claim,
  isOnGraph,
  toggle,
}: {
  claim: DebateClaimSummary;
  isOnGraph: boolean;
  toggle: React.ReactNode;
}) {
  return (
    <>
      {/* `items-start` so the chip stays put when the toggle stacks an explanation beneath it. */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <SpaceChip spaceId={claim.space_id} />
        {toggle}
      </div>
      {isOnGraph ? (
        <Link
          href={NavUtils.toEntity(claim.space_id, claim.claim_entity_id)}
          className="mb-3 block text-metadataMedium hover:underline"
        >
          {claim.claim}
        </Link>
      ) : (
        <Text as="p" variant="metadataMedium" className="mb-3">
          {claim.claim}
        </Text>
      )}
    </>
  );
}

/** The live case: the side buttons publish the viewer's on-chain response. */
function RespondableControls({
  claim,
  positions,
  readiness,
  activeDebate,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: boolean;
}) {
  const target = {
    entityId: claim.claim_entity_id,
    spaceId: claim.space_id,
    responseKind: readiness.response_kind,
  };
  const { submitResponse, isConnected } = useEntityResponse(target);
  const responseIndexing = useEntityResponseIndexingSnapshot(target);
  const resetResponseIndexing = useResetEntityResponseIndexingSnapshot(target);
  // Publishing before the personal space finishes registering fails, so wait it out the same way
  // the claim page does.
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();

  const copy = ENTITY_RESPONSE_COPY[readiness.response_kind];
  const [responseError, setResponseError] = React.useState<string | null>(null);

  // The client knows its own response long before geo-chat does — publishing, indexing, and then
  // the notification round trip all have to finish first. Any non-idle snapshot means we know,
  // including `indexed`; dropping back to geo-chat's copy too early is what made a successful
  // response look like it had been discarded.
  const pendingResponse = responseIndexing.status === 'idle' ? null : responseIndexing.pending;
  const optimisticPosition =
    pendingResponse?.expectedResponse == null ? null : pendingResponse.expectedResponse === 'positive';
  const viewerPosition = pendingResponse ? optimisticPosition : (readiness.viewer_response?.position ?? null);
  const isPublishing = responseIndexing.status === 'reconciling' || responseIndexing.status === 'delayed';

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
    if (!isConnected || isAccountSetupPending) return;
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

  return (
    <>
      <ClaimHeader
        claim={claim}
        isOnGraph
        toggle={
          <ClaimReadinessToggle
            claim={claim}
            readiness={readiness}
            activeDebate={activeDebate}
            hasResponse={viewerPosition !== null}
            responseIndexing={isPublishing}
          />
        }
      />
      <PositionRow
        positions={positions}
        responseKind={readiness.response_kind}
        viewerPosition={viewerPosition}
        onRespond={respond}
        disabled={!isConnected || isPublishing || isAccountSetupPending}
        titleFor={actionTitle}
      />
      {responseError ? (
        <div role="alert" className="mt-2">
          <Text as="p" variant="footnote" color="red-01">
            {responseError}
          </Text>
        </div>
      ) : null}
    </>
  );
}

/** The graph can't resolve this claim, so the sides are read-only and there's nothing to respond to. */
function UnresolvableControls({
  claim,
  positions,
  readiness,
  activeDebate,
}: {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
  activeDebate?: boolean;
}) {
  return (
    <>
      <ClaimHeader
        claim={claim}
        isOnGraph={false}
        toggle={
          /* Readiness is geo-chat state, so it still works without a graph id. */
          <ClaimReadinessToggle
            claim={claim}
            readiness={readiness}
            activeDebate={activeDebate}
            hasResponse={readiness.viewer_response !== null}
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

function PositionRow({
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
  const { spacesById } = useSpacesByIds(React.useMemo(() => (validateSpaceId(spaceId) ? [spaceId] : []), [spaceId]));
  const space = spacesById.get(spaceId);
  const name = space?.entity?.name ?? 'Space';
  const image = space?.entity?.image ?? null;

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
      {summary && summary.total_count > 0 ? <PositionAvatars summary={summary} /> : null}
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

function PositionAvatars({ summary }: { summary: DebateClaimPositionSummary }) {
  const participants = summary.participants.slice(0, 2);
  const overflow = Math.max(0, summary.total_count - participants.length);

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
