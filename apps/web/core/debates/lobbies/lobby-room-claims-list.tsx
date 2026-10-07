'use client';

import * as React from 'react';

import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type {
  Debate,
  DebateClaimPositionSummary,
  DebateClaimSummary,
  DebateParticipantSummary,
  MatchmakingReadiness,
} from '../api';
import { HubCardList } from '../matchmaking/hub-motion';
import { MatchmakingClaimCard } from '../matchmaking/matchmaking-claim-card';
import { hostsLabel, personName } from './lobby-format';

/** One side of an "In this room" claim, counted over the people in the room. */
export type LobbyRoomSide = DebateClaimPositionSummary & {
  /** People on this side the viewer could send a lobby-scoped request to right now. */
  requestable_count: number;
};

/** One "In this room" claim, as the list draws it. */
export type LobbyRoomClaim = {
  claim: DebateClaimSummary;
  readiness: MatchmakingReadiness;
  positions: LobbyRoomSide[];
  activeDebate?: Debate | boolean | null;
};

/** What the card offers, given the side the viewer holds now. */
export type LobbyRoomOffer = {
  entry: LobbyRoomClaim;
  viewerPosition: boolean;
  /** People on the other side the viewer can request. */
  requestableCount: number;
};

const FACES_SHOWN = 3;

export function LobbyRoomClaimsList({
  claims,
  renderOffer,
}: {
  claims: LobbyRoomClaim[];
  /** The lobby-scoped request control. Only called when someone on the other side can be requested. */
  renderOffer: (offer: LobbyRoomOffer) => React.ReactNode;
}) {
  return (
    <HubCardList>
      {claims.map(entry => (
        <LobbyRoomClaimCard key={entry.claim.id} entry={entry} renderOffer={renderOffer} />
      ))}
    </HubCardList>
  );
}

function LobbyRoomClaimCard({
  entry,
  renderOffer,
}: {
  entry: LobbyRoomClaim;
  renderOffer: (offer: LobbyRoomOffer) => React.ReactNode;
}) {
  const viewerPosition = useViewerPosition(entry);
  const opposing = roomSideOpposing(entry.positions, viewerPosition);
  const requestableCount = opposing?.requestable_count ?? 0;
  const offer =
    viewerPosition !== null && requestableCount > 0 ? renderOffer({ entry, viewerPosition, requestableCount }) : null;

  return (
    <MatchmakingClaimCard
      claim={entry.claim}
      positions={entry.positions}
      readiness={entry.readiness}
      activeDebate={entry.activeDebate}
      answersMayComeFromIndex
      // Keeps the meta row's height when there is no offer.
      endSlot={offer ?? <span className="h-5 shrink-0" aria-hidden />}
      footer={
        opposing && opposing.participants.length > 0 ? <DisagreeingInRoom people={opposing.participants} /> : undefined
      }
    />
  );
}

/**
 * The viewer's side: their own response while it publishes and indexes, geo-chat's otherwise. The
 * card draws the same optimistic side, so the offer and the footer follow a vote at once.
 */
function useViewerPosition(entry: LobbyRoomClaim): boolean | null {
  const snapshot = useEntityResponseIndexingSnapshot({
    entityId: entry.claim.claim_entity_id,
    entityName: entry.claim.claim,
    spaceId: entry.claim.space_id,
    responseKind: CLAIM_RESPONSE_KIND,
  });
  if (snapshot.status !== 'idle' && snapshot.pending) {
    return snapshot.pending.expectedResponse === null ? null : snapshot.pending.expectedResponse === 'positive';
  }
  return entry.readiness.viewer_response?.position ?? null;
}

/** The side opposite the viewer's, or null when they hold none. */
export function roomSideOpposing(positions: LobbyRoomSide[], viewerPosition: boolean | null) {
  if (viewerPosition === null) return null;
  return positions.find(side => side.position !== viewerPosition) ?? null;
}

function DisagreeingInRoom({ people }: { people: DebateParticipantSummary[] }) {
  return (
    <div className="mt-3 flex items-center gap-2" data-testid="lobby-claim-disagreeing">
      <span className="flex -space-x-1.5">
        {people.slice(0, FACES_SHOWN).map(person => (
          <span key={person.user_id} className="size-5 overflow-hidden rounded-full ring-2 ring-white">
            <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} alt={personName(person)} size={20} />
          </span>
        ))}
      </span>
      <Text as="p" variant="footnote" color="grey-04" ellipsize>
        Disagrees with you: {hostsLabel(people)}
      </Text>
    </div>
  );
}
