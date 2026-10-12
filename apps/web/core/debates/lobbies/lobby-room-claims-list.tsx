'use client';

import * as React from 'react';

import { WatchLiveLink } from '~/core/claims/browse/claim-end-slot';
import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
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
import { trustedIndexedPosition, useBackfillReadinessForHeldPosition } from '../backfill-readiness-for-held-position';
import { HubCardList } from '../matchmaking/hub-motion';
import { MatchmakingClaimCard, isResolvableClaim } from '../matchmaking/matchmaking-claim-card';
import { hostsLabel, personName } from './lobby-format';
import { useIsLobbyGuest } from './lobby-guest-hooks';

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
  /**
   * Explore only, where `positions` are counted across Geo: the room's sides (others only), drawn as a
   * line under the card with the offer, or null when nobody in the room holds a side.
   */
  roomSides?: LobbyRoomSide[] | null;
};

/** What the card offers, given the side the viewer holds now. */
export type LobbyRoomOffer = {
  entry: LobbyRoomClaim;
  viewerPosition: boolean;
  /** People on the other side the viewer can request. */
  requestableCount: number;
  /** The chain's side for the viewer, or null where it can't be trusted yet. */
  indexedPosition: boolean | null;
  /** The viewer's response has been slow to index. */
  indexingDelayed: boolean;
};

const FACES_SHOWN = 3;

export function LobbyRoomClaimsList({
  claims,
  renderOffer,
  renderHeader,
  renderMenu,
}: {
  claims: LobbyRoomClaim[];
  /** The lobby-scoped request control. Only called when someone on the other side can be requested. */
  renderOffer: (offer: LobbyRoomOffer) => React.ReactNode;
  /** Above the claim, e.g. who highlighted it. */
  renderHeader?: (entry: LobbyRoomClaim) => React.ReactNode;
  /** Host controls, beside the offer. */
  renderMenu?: (entry: LobbyRoomClaim) => React.ReactNode;
}) {
  return (
    <HubCardList>
      {claims.map(entry => (
        <LobbyRoomClaimCard
          key={entry.claim.id}
          entry={entry}
          renderOffer={renderOffer}
          renderHeader={renderHeader}
          renderMenu={renderMenu}
        />
      ))}
    </HubCardList>
  );
}

export function LobbyRoomClaimCard({
  entry,
  answersReady,
  renderOffer,
  renderHeader,
  renderMenu,
}: {
  entry: LobbyRoomClaim;
  /** The host's own `MatchmakingClaimCard.answersReady`, where it has one. */
  answersReady?: boolean;
  renderOffer: (offer: LobbyRoomOffer) => React.ReactNode;
  renderHeader?: (entry: LobbyRoomClaim) => React.ReactNode;
  renderMenu?: (entry: LobbyRoomClaim) => React.ReactNode;
}) {
  const { claim } = entry;
  // A guest's vote is kept on the device until they save it with an account (GEO-3214).
  const guest = useIsLobbyGuest();
  // The card holds its own response reads until it is near the viewport; this one follows it.
  const { ref, nearViewport } = useNearViewport();
  const indexing = useEntityResponseIndexingSnapshot({
    entityId: claim.claim_entity_id,
    entityName: claim.claim,
    spaceId: claim.space_id,
    responseKind: CLAIM_RESPONSE_KIND,
  });
  const summary = useClaimResponseSummary(
    claim.claim_entity_id,
    claim.space_id,
    CLAIM_RESPONSE_KIND,
    nearViewport && isResolvableClaim(claim)
  );
  const indexedPosition = trustedIndexedPosition(
    summary,
    indexing.status === 'reconciling' || indexing.status === 'delayed'
  );
  // The viewer's own response while it publishes and indexes; then geo-chat's. The chain's only for a
  // withdrawn row the viewer has re-answered, the one gap the backfill below repairs.
  const retaken = entry.readiness.readiness_disabled_reason === 'claim_response_withdrawn';
  const viewerPosition =
    indexing.status !== 'idle' && indexing.pending
      ? indexing.pending.expectedResponse === null
        ? null
        : indexing.pending.expectedResponse === 'positive'
      : (entry.readiness.viewer_response?.position ?? (retaken ? indexedPosition : null));
  // A held side geo-chat hasn't marked ready can't send or receive a request.
  useBackfillReadinessForHeldPosition({
    readiness: entry.readiness,
    entityId: claim.claim_entity_id,
    spaceId: claim.space_id,
    indexedPosition,
  });
  const explore = entry.roomSides !== undefined;
  const roomSides = explore ? entry.roomSides : entry.positions;
  const opposing = roomSides ? roomSideOpposing(roomSides, viewerPosition) : null;
  const requestableCount = opposing?.requestable_count ?? 0;
  const offer =
    viewerPosition !== null && requestableCount > 0
      ? renderOffer({
          entry,
          viewerPosition,
          requestableCount,
          indexedPosition,
          indexingDelayed: indexing.status === 'delayed',
        })
      : null;
  const menu = renderMenu?.(entry);
  const watch = entry.activeDebate ? (
    <WatchLiveLink activeDebate={entry.activeDebate} spaceId={claim.space_id} />
  ) : null;
  // On Explore the offer rides on the room line.
  const action = explore ? watch : (offer ?? watch);

  return (
    <MatchmakingClaimCard
      ref={ref}
      claim={claim}
      positions={entry.positions}
      readiness={entry.readiness}
      activeDebate={entry.activeDebate}
      answersReady={answersReady}
      answersMayComeFromIndex
      allowsSignedOutVotes={guest}
      header={renderHeader?.(entry)}
      // Never the card's default slot: its request would not be lobby-scoped. The spacer keeps the
      // meta row's height when there is neither an action nor a host menu.
      endSlot={
        menu ? (
          <span className="flex shrink-0 items-center gap-1">
            {action}
            {menu}
          </span>
        ) : (
          (action ?? <span className="h-5 shrink-0" aria-hidden />)
        )
      }
      footer={
        explore ? (
          entry.roomSides ? (
            <RoomLine sides={entry.roomSides} viewerPosition={viewerPosition} offer={offer} />
          ) : undefined
        ) : opposing && opposing.participants.length > 0 ? (
          <DisagreeingInRoom people={opposing.participants} />
        ) : undefined
      }
    />
  );
}

/** The side opposite the viewer's, or null when they hold none. */
export function roomSideOpposing(positions: LobbyRoomSide[], viewerPosition: boolean | null) {
  if (viewerPosition === null) return null;
  return positions.find(side => side.position !== viewerPosition) ?? null;
}

function DisagreeingInRoom({ people }: { people: DebateParticipantSummary[] }) {
  return (
    <div className="mt-3 flex items-center gap-2" data-testid="lobby-claim-disagreeing">
      <RoomFaces people={people} />
      <Text as="p" variant="footnote" color="grey-04" ellipsize>
        Disagrees with you: {hostsLabel(people)}
      </Text>
    </div>
  );
}

/** "In this room: 2 agree · 1 disagrees", the viewer counted on their side, with the offer at the end. */
function RoomLine({
  sides,
  viewerPosition,
  offer,
}: {
  sides: LobbyRoomSide[];
  viewerPosition: boolean | null;
  offer: React.ReactNode;
}) {
  const counted = sides
    .map(side => ({ side, count: side.total_count + (side.position === viewerPosition ? 1 : 0) }))
    .filter(({ count }) => count > 0);
  return (
    <div className="mt-3 flex items-center gap-2" data-testid="lobby-claim-room-line">
      <Text as="p" variant="footnote" color="grey-04" className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="shrink-0">In this room:</span>
        {counted.map(({ side, count }, index) => (
          <React.Fragment key={String(side.position)}>
            {index > 0 ? <span aria-hidden>·</span> : null}
            <RoomFaces people={side.participants} />
            <span className="shrink-0">
              {count} {roomSideVerb(side.position_label, count)}
            </span>
          </React.Fragment>
        ))}
      </Text>
      {offer}
    </div>
  );
}

/** "agree" for several, "agrees" for one. */
export function roomSideVerb(label: string, count: number) {
  const verb = label.toLowerCase();
  return count === 1 ? `${verb}s` : verb;
}

function RoomFaces({ people }: { people: DebateParticipantSummary[] }) {
  if (people.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {people.slice(0, FACES_SHOWN).map(person => (
        <span key={person.user_id} className="size-5 overflow-hidden rounded-full ring-2 ring-white">
          <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} alt={personName(person)} size={20} />
        </span>
      ))}
    </span>
  );
}
