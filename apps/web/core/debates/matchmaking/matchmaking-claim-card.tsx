'use client';

import * as React from 'react';

import cx from 'classnames';

import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';

import type { DebateClaimPositionSummary, DebateClaimSummary } from '../api';
import { useClearDebateIntent, useSetDebateIntent } from './hooks';

type Props = {
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  viewerPosition: boolean | null;
  disabled?: boolean;
  /** Rendered under the position row — e.g. the Matches tab's "Request debate" button. */
  footer?: React.ReactNode;
  /** Rendered on the header row opposite the space chip — e.g. the debate-intent toggle. */
  headerAction?: React.ReactNode;
};

export function MatchmakingClaimCard({ claim, positions, viewerPosition, disabled, footer, headerAction }: Props) {
  const setIntent = useSetDebateIntent();
  const clearIntent = useClearDebateIntent();

  const forSide = positions.find(position => position.position === true);
  const againstSide = positions.find(position => position.position === false);
  const pending = setIntent.isPending || clearIntent.isPending;

  // Clicking the position you already hold clears it, mirroring the claim popover on entity pages.
  const choose = (position: boolean) => {
    if (viewerPosition === position) {
      clearIntent.mutate({ spaceId: claim.space_id, claimId: claim.claim_entity_id });
      return;
    }
    setIntent.mutate({ spaceId: claim.space_id, claimId: claim.claim_entity_id, position });
  };

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SpaceChip spaceId={claim.space_id} />
        {headerAction}
      </div>
      <p className="mb-3 text-metadataMedium">{claim.claim}</p>
      <div className="grid grid-cols-2 gap-2">
        <PositionButton
          label={forSide?.position_label ?? 'Yes'}
          summary={forSide}
          position
          selected={viewerPosition === true}
          disabled={disabled || pending}
          onClick={() => choose(true)}
        />
        <PositionButton
          label={againstSide?.position_label ?? 'No'}
          summary={againstSide}
          position={false}
          selected={viewerPosition === false}
          disabled={disabled || pending}
          onClick={() => choose(false)}
        />
      </div>
      {footer}
    </article>
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

function PositionButton({
  label,
  summary,
  position,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  summary: DebateClaimPositionSummary | undefined;
  position: boolean;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-7 items-center justify-between gap-2 rounded-full px-3 text-button text-text transition-colors disabled:opacity-60',
        selected ? (position ? 'bg-green' : 'bg-red-01') : 'bg-bg hover:bg-grey-01'
      )}
    >
      <span className="truncate">{label}</span>
      {summary && summary.total_count > 0 ? <PositionAvatars summary={summary} /> : null}
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
