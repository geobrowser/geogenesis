'use client';

import * as React from 'react';

import Link from 'next/link';

import { personProfileOpened } from '~/core/analytics';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import type { DebateParticipantSummary, DebateRequestParty } from '../api';
import { speakerLabel } from '../playback-utils';

/**
 * A claimless challenge carries only the two people — no claim means no side to take, so its
 * parties are plain summaries rather than the position-bearing parties a claim request has.
 */
type RequestPartyLike = DebateParticipantSummary | DebateRequestParty;

/**
 * Named from the side the party took, not from geo-chat's `position_label`.
 *
 * The label reads "Verify" or "Dispute" on a claim geo-chat still calls factual, which is a word
 * this app no longer has a way to publish — see `positionSummariesFromCounts`. `position` is the
 * same boolean either way, and its absence is what distinguishes a claimless challenge.
 */
function positionLabel(party: RequestPartyLike): string | null {
  return 'position' in party ? responsePositionLabel(party.position) : null;
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
  profileLinkTarget,
}: {
  viewer: RequestPartyLike | null;
  opponent: RequestPartyLike;
  showPositions?: boolean;
  /** The "…" menu, which the design anchors to the opponent's end of the row. */
  overflow?: React.ReactNode;
  /**
   * `_blank` where following the opponent's name must not leave the page — a card inside a live
   * debate room, where navigating away would drop the viewer out of it. The hub survives
   * navigation on its own (GEO-2788), so its cards follow the link in place.
   */
  profileLinkTarget?: '_blank';
}) {
  return (
    <div className="flex items-stretch rounded-lg bg-grey-01">
      <PartySummary party={viewer} label="You" showPosition={showPositions} />
      <VersusMarker />
      <PartySummary
        party={opponent}
        label={speakerLabel(opponent)}
        showPosition={showPositions}
        trailing={overflow}
        linkToProfile
        linkTarget={profileLinkTarget}
      />
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
  linkToProfile = false,
  linkTarget,
}: {
  party: RequestPartyLike | null;
  label: string;
  showPosition: boolean;
  trailing?: React.ReactNode;
  linkToProfile?: boolean;
  linkTarget?: '_blank';
}) {
  // Unlinked when the id is not a space id: an anchor to `/space/undefined` would look identical
  // until it was clicked.
  const profileSpaceId =
    linkToProfile && party && validateSpaceId(party.profile_space_id) ? party.profile_space_id : null;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3.5">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
            {party ? (
              <Avatar avatarUrl={party.avatar_cid} value={party.profile_space_id} size={20} alt={label} />
            ) : null}
          </span>
          {profileSpaceId ? (
            <Link
              href={NavUtils.toSpace(profileSpaceId)}
              target={linkTarget}
              rel={linkTarget === '_blank' ? 'noopener noreferrer' : undefined}
              onClick={() =>
                personProfileOpened(profileSpaceId, null, { interaction_surface: 'debates_request_parties' })
              }
              className="truncate text-footnote hover:underline"
            >
              {label}
            </Link>
          ) : (
            <span className="truncate text-footnote">{label}</span>
          )}
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
