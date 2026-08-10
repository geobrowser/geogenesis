'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';

import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';

import type { DebateClaimPositionSummary, DebateClaimSummary, DebateResponseKind, DebateResponseSummary } from '../api';
import { hubCardMotion } from './hub-motion';

type Props = {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  responseKind: DebateResponseKind;
  /** The viewer's on-chain response, independent of whether they're ready to debate it. */
  viewerResponse: DebateResponseSummary | null;
  /** Rendered under the position row — e.g. the Matches tab's "Request debate" button. */
  footer?: React.ReactNode;
  /** Rendered on the header row opposite the space chip — e.g. the readiness toggle. */
  headerAction?: React.ReactNode;
};

/** Only used when a side has no participants yet and so carries no server-supplied label. */
function fallbackLabels(responseKind: DebateResponseKind) {
  return responseKind === 'veracity'
    ? { agree: 'Verify', disagree: 'Dispute' }
    : { agree: 'Agree', disagree: 'Disagree' };
}

/**
 * A position is an on-chain claim response now, so the hub can only *show* the sides — taking one
 * means responding to the claim itself. The card links out for that; readiness (the part the hub
 * does own) rides in `headerAction`.
 */
export function MatchmakingClaimCard({ claim, positions, responseKind, viewerResponse, footer, headerAction }: Props) {
  const forSide = positions.find(position => position.position === true);
  const againstSide = positions.find(position => position.position === false);
  const fallback = fallbackLabels(responseKind);

  return (
    // `w-full` matters: popLayout absolutely positions an exiting card, which would otherwise
    // collapse to its content width as it fades.
    <motion.article {...hubCardMotion} className="w-full rounded-lg border border-grey-02 bg-white p-3">
      {/* items-start, not items-center: the readiness toggle grows when it shows an explanation,
          and centering would drag the space chip out of line with it. */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <SpaceChip spaceId={claim.space_id} />
        {headerAction}
      </div>
      <Link
        href={NavUtils.toEntity(claim.space_id, claim.claim_entity_id)}
        className="mb-3 block text-metadataMedium hover:underline"
      >
        {claim.claim}
      </Link>
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
      {footer}
    </motion.article>
  );
}

export function SpaceChip({ spaceId }: { spaceId: string }) {
  const { spacesById } = useSpacesByIds(React.useMemo(() => [spaceId], [spaceId]));
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
