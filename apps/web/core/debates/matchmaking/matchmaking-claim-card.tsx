'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';

import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { NavUtils, validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { Text } from '~/design-system/text';

import type { DebateClaimPositionSummary, DebateClaimSummary, DebateResponseKind, MatchmakingReadiness } from '../api';
import { DebateEntityResponseControls } from '../debate-entity-response-controls';
import { ClaimReadinessToggle } from './claim-readiness-toggle';
import { hubCardMotion } from './hub-motion';

type Props = {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  /** Drives both the response controls and the readiness toggle. */
  readiness: MatchmakingReadiness;
  activeDebate?: boolean;
  /** Rendered under the controls row — e.g. the Matches tab's "Request debate" button. */
  footer?: React.ReactNode;
};

/**
 * Whether the knowledge graph can actually resolve this claim. geo-chat keys claims by their graph
 * entity id, but nothing guarantees the id it returns is one the graph will accept — a malformed
 * one makes every graph query for it fail.
 */
export function isResolvableClaim(claim: Pick<DebateClaimSummary, 'space_id' | 'claim_entity_id'>) {
  return validateEntityId(claim.claim_entity_id) && validateSpaceId(claim.space_id);
}

/** Only used when a side has no participants yet and so carries no server-supplied label. */
function fallbackLabels(responseKind: DebateResponseKind) {
  return responseKind === 'veracity'
    ? { agree: 'Verify', disagree: 'Dispute' }
    : { agree: 'Agree', disagree: 'Disagree' };
}

/**
 * The side pills are read-only summaries of who is available to debate — geo-chat data. Taking a
 * side is an on-chain response, so that goes through the same controls the claim page uses, paired
 * here with the readiness toggle exactly as `ClaimDebateReadiness` pairs them.
 */
export function MatchmakingClaimCard({ claim, positions, readiness, activeDebate, footer }: Props) {
  const forSide = positions.find(position => position.position === true);
  const againstSide = positions.find(position => position.position === false);
  const fallback = fallbackLabels(readiness.response_kind);
  const viewerResponse = readiness.viewer_response;
  // geo-chat is a separate system and can hand back a claim the knowledge graph has never seen.
  // Responding to one is impossible, and asking the graph about it 400s, so don't offer or ask.
  const isOnGraph = isResolvableClaim(claim);

  return (
    // `w-full` matters: popLayout absolutely positions an exiting card, which would otherwise
    // collapse to its content width as it fades.
    <motion.article {...hubCardMotion} className="w-full rounded-lg border border-grey-02 bg-white p-3">
      <div className="mb-2">
        <SpaceChip spaceId={claim.space_id} />
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
      <div className="grid grid-cols-2 gap-2">
        <PositionSummary
          label={forSide?.position_label ?? fallback.agree}
          summary={forSide}
          position
          selected={viewerResponse?.position === true}
        />
        <PositionSummary
          label={againstSide?.position_label ?? fallback.disagree}
          summary={againstSide}
          position={false}
          selected={viewerResponse?.position === false}
        />
      </div>
      {/* Responding and going ready sit together here the same way they do on the claim page:
          the response is the on-chain half, the toggle is the matchmaking half. */}
      <div className="mt-3 flex items-start justify-between gap-3">
        {isOnGraph ? (
          <DebateEntityResponseControls
            entityId={claim.claim_entity_id}
            spaceId={claim.space_id}
            responseKind={readiness.response_kind}
          />
        ) : (
          <Text as="span" variant="footnote" color="grey-04">
            Claim unavailable
          </Text>
        )}
        <ClaimReadinessToggle claim={claim} readiness={readiness} activeDebate={activeDebate} />
      </div>
      {footer}
    </motion.article>
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

function PositionSummary({
  label,
  summary,
  position,
  selected,
}: {
  label: string;
  summary: DebateClaimPositionSummary | undefined;
  position: boolean;
  selected: boolean;
}) {
  return (
    <div
      className={cx(
        'flex min-h-7 items-center justify-between gap-2 rounded-full px-3 text-button text-text',
        selected ? (position ? 'bg-green' : 'bg-red-01') : 'bg-bg'
      )}
    >
      <span className="truncate">
        {label}
        {selected ? <span className="sr-only"> — your position</span> : null}
      </span>
      {summary && summary.total_count > 0 ? <PositionAvatars summary={summary} /> : null}
    </div>
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
