'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';

import type { DebateParticipantSummary, DebateRequestParty } from '../api';
import { speakerLabel } from '../playback-utils';

/**
 * A claimless challenge carries only the two people — no claim means no side to take, so its
 * parties are plain summaries rather than the position-bearing parties a claim request has.
 */
type RequestPartyLike = DebateParticipantSummary | DebateRequestParty;

function positionLabel(party: RequestPartyLike): string | null {
  return 'position_label' in party ? party.position_label : null;
}

/**
 * The "You vs Them" row shared by the sent and received request cards: one inset strip, each side
 * carrying a name and the position they hold, split by the VS marker. Positions are omitted for
 * claimless challenges, which have no side to take.
 */
export function RequestParties({
  viewer,
  opponent,
  showPositions = true,
  overflow,
}: {
  viewer: RequestPartyLike | null;
  opponent: RequestPartyLike;
  showPositions?: boolean;
  /** The "…" menu, which the design anchors to the opponent's end of the row. */
  overflow?: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch rounded-lg bg-grey-01">
      <PartySummary party={viewer} label="You" showPosition={showPositions} />
      <VersusMarker />
      <PartySummary party={opponent} label={speakerLabel(opponent)} showPosition={showPositions} trailing={overflow} />
    </div>
  );
}

function VersusMarker() {
  return (
    <div aria-hidden className="flex shrink-0 flex-col items-center">
      <span className="w-px flex-1 bg-grey-02" />
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-grey-02 bg-white text-footnoteMedium">
        VS
      </span>
      <span className="w-px flex-1 bg-grey-02" />
    </div>
  );
}

function PartySummary({
  party,
  label,
  showPosition,
  trailing,
}: {
  party: RequestPartyLike | null;
  label: string;
  showPosition: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3.5">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
            {party ? (
              <Avatar avatarUrl={party.avatar_cid} value={party.profile_space_id} size={20} alt={label} />
            ) : null}
          </span>
          <span className="truncate text-footnote">{label}</span>
        </span>
        {showPosition && party && positionLabel(party) ? (
          <span className="max-w-full shrink-0 truncate rounded-full bg-grey-02 px-1.5 py-0.5 text-footnote">
            {positionLabel(party)}
          </span>
        ) : null}
      </div>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}
