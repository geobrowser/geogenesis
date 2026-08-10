'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';

import type { DebateRequestParty } from '../api';
import { speakerLabel } from '../playback-utils';

/**
 * The "You vs Them" row shared by the incoming-request and awaiting-response cards. Positions are
 * omitted for claimless challenges, which have no side to take.
 */
export function RequestParties({
  viewer,
  opponent,
  showPositions = true,
}: {
  viewer: DebateRequestParty | null;
  opponent: DebateRequestParty;
  showPositions?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-lg border border-grey-02 px-2 py-3">
      <PartySummary party={viewer} label="You" showPosition={showPositions} />
      <span className="grid w-10 place-items-center text-footnote text-grey-04">vs</span>
      <PartySummary party={opponent} label={speakerLabel(opponent)} showPosition={showPositions} />
    </div>
  );
}

function PartySummary({
  party,
  label,
  showPosition,
}: {
  party: DebateRequestParty | null;
  label: string;
  showPosition: boolean;
}) {
  return (
    <div className="grid min-w-0 justify-items-center gap-1.5 text-center">
      <span className="h-6 w-6 overflow-hidden rounded-full">
        {party ? <Avatar avatarUrl={party.avatar_cid} value={party.profile_space_id} size={24} alt={label} /> : null}
      </span>
      <span className="max-w-full truncate text-footnoteMedium">{label}</span>
      {showPosition && party ? (
        <span className="max-w-full truncate rounded-full bg-grey-02 px-2 py-0.5 text-footnote">
          {party.position_label}
        </span>
      ) : null}
    </div>
  );
}
