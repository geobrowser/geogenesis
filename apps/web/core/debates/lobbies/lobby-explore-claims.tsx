'use client';

import * as React from 'react';

import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { normId } from '~/core/utils/norm-id';

import type { DebateLobbyClaim, MatchmakingClaim } from '../api';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { type ClaimCardDefaults, ClaimsTab } from '../matchmaking/claims-tab';
import { useHubScrollSelector } from '../matchmaking/hub-scroll';
import { useAgendaClaimFilterContext } from '../todays-claims/agenda-claim-filter';
import { useLobbyRoomClaims } from './lobby-agenda-claims';
import { LOBBY_CLAIMS_CONTROLS_TOP_CLASS } from './lobby-claims-sticky';
import {
  exploreRoomClaimBatches,
  roomRowsByClaim,
  useLobbyExploreRoomClaims,
  useNearExploreBatches,
} from './lobby-explore-claims-hooks';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import { LobbyClaimHostMenu } from './lobby-highlights';
import { useLobbyHighlights } from './lobby-highlights-hooks';
import { LobbyClaimRequest } from './lobby-room-claims';
import {
  type LobbyRoomClaim,
  LobbyRoomClaimCard,
  type LobbyRoomOffer,
  type LobbyRoomSide,
} from './lobby-room-claims-list';
import type { LobbyPageView } from './lobby-view';

/**
 * The lobby's "Explore" claims tab: the debates panel's claim browser, with each card drawn as an
 * "In this room" card so its request is lobby-scoped and its faces are the room's.
 */
export function LobbyExploreClaims({ lobby }: { lobby: LobbyPageView }) {
  const [batches, setBatches] = React.useState<string[][]>([]);
  const onVisibleClaims = React.useCallback((entries: MatchmakingClaim[]) => {
    const next = exploreRoomClaimBatches(entries);
    setBatches(current => (sameBatches(current, next) ? current : next));
  }, []);
  const renderRoomCard = useLobbyRoomCardRenderer(lobby, batches);
  // GEO-3775: agenda claims only when the lobby is; the room provides the filter.
  const agendaFilter = useAgendaClaimFilterContext();
  const renderClaim = React.useCallback(
    (entry: MatchmakingClaim, card: ClaimCardDefaults) => renderRoomCard(entry, card.answersReady),
    [renderRoomCard]
  );

  // The tab pads its own controls and list, inside the claims pane's padding. They pin under the
  // claims area's pinned tab row; see `lobby-claims-sticky`.
  return (
    <div className="-mx-4">
      <ClaimsTab
        variant="lobbyExplore"
        agendaFilter={agendaFilter}
        renderClaim={renderClaim}
        onVisibleClaims={onVisibleClaims}
        stickyTopClassName={LOBBY_CLAIMS_CONTROLS_TOP_CLASS}
      />
    </div>
  );
}

/**
 * Draws a graph-sourced claim as an "In this room" card: lobby-scoped request, the room's faces,
 * the host menu. The room's sides are read only for the `batches` holding a card near the viewport.
 * Shared by Explore and the claim list tabs (GEO-3274), which list claims the same way.
 */
export function useLobbyRoomCardRenderer(lobby: LobbyPageView, batches: string[][]) {
  const lobbyId = lobby.lobby_id;
  const { active, onNear } = useNearExploreBatches(batches);
  const roomRows = useLobbyCardRoomRows(lobbyId, active);
  const { data: highlights } = useLobbyHighlights(lobbyId);
  const hosting = lobby.viewer.hosting;

  const renderOffer = React.useCallback(
    (offer: LobbyRoomOffer) => <LobbyClaimRequest lobbyId={lobbyId} offer={offer} />,
    [lobbyId]
  );
  const renderMenu = React.useCallback(
    (entry: LobbyRoomClaim) =>
      hasDebateClaimRow(entry.claim) ? (
        <LobbyClaimHostMenu lobbyId={lobbyId} claim={entry.claim} state={highlights} />
      ) : null,
    [highlights, lobbyId]
  );

  return React.useCallback(
    (entry: MatchmakingClaim, answersReady: boolean) => (
      <NearViewport claimEntityId={entry.claim.claim_entity_id} onNear={onNear}>
        <LobbyRoomClaimCard
          entry={exploreRoomClaim(entry, roomRows.get(claimRowKey(entry)))}
          answersReady={answersReady}
          renderOffer={renderOffer}
          renderMenu={hosting ? renderMenu : undefined}
        />
      </NearViewport>
    ),
    [hosting, onNear, renderMenu, renderOffer, roomRows]
  );
}

/**
 * The room's sides for the batches near the viewport, by `claimRowKey`. GEO-3775: an agenda-only
 * member's "In this room" read already holds every agenda claim's, so only a batch with a claim no
 * agenda lists (a host list with `AGENDA_ONLY_LOBBY_HOST_LISTS` off) is read again.
 */
function useLobbyCardRoomRows(lobbyId: string, active: string[][]) {
  const agenda = useAgendaClaimFilterContext();
  const guest = useIsLobbyGuest();
  const fromRoom = agenda.active && !guest;
  const { data: room } = useLobbyRoomClaims(lobbyId, fromRoom);
  const unread = React.useMemo(
    () => (fromRoom ? active.filter(batch => batch.some(id => !agenda.has(id))) : active),
    [active, agenda, fromRoom]
  );
  const read = useLobbyExploreRoomClaims(lobbyId, unread);
  return React.useMemo(() => {
    if (!fromRoom || !room) return read;
    const rows = roomRowsByClaim([room.claims]);
    for (const [key, row] of read) rows.set(key, row);
    return rows;
  }, [fromRoom, read, room]);
}

/** Reports whether its card is near the viewport, both ways, so far-off batches stop being read. */
function NearViewport({
  claimEntityId,
  onNear,
  children,
  ref: listRef,
}: {
  claimEntityId: string;
  onNear: (claimEntityId: string, near: boolean) => void;
  children: React.ReactNode;
  /** The list's popLayout measures the row through this. */
  ref?: React.Ref<HTMLDivElement>;
}) {
  const hubScrollSelector = useHubScrollSelector();
  const { ref, nearViewport } = useNearViewport({ sticky: false, rootSelector: hubScrollSelector });
  // Paired, as `onNear` counts cards per id.
  React.useEffect(() => {
    if (!nearViewport) return;
    onNear(claimEntityId, true);
    return () => onNear(claimEntityId, false);
  }, [claimEntityId, nearViewport, onNear]);
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      ref(node);
      if (typeof listRef === 'function') listRef(node);
      else if (listRef) listRef.current = node;
    },
    [listRef, ref]
  );
  return <div ref={setRef}>{children}</div>;
}

function sameBatches(a: string[][], b: string[][]) {
  return a.length === b.length && a.every((batch, index) => batch.join(',') === b[index]!.join(','));
}

/**
 * An Explore row for the room card: Geo-wide sides, plus the room's where geo-chat has an entry.
 * The entry's id is geo-chat's claim row, which host actions need.
 */
export function exploreRoomClaim(entry: MatchmakingClaim, roomRow: DebateLobbyClaim | undefined): LobbyRoomClaim {
  return {
    claim: roomRow ? { ...entry.claim, id: roomRow.claim.id } : entry.claim,
    readiness: entry,
    activeDebate: entry.active_debate,
    positions: entry.positions.map(side => ({ ...side, requestable_count: 0 })),
    roomSides: roomRow ? roomRow.positions.map(roomSide) : null,
  };
}

/** One side as the room line counts it: the others in the room, without the viewer. */
function roomSide(side: DebateLobbyClaim['positions'][number]): LobbyRoomSide {
  return {
    position: side.position,
    position_label: side.position_label,
    total_count: side.total_in_room,
    available_now_count: side.requestable_count,
    present_count: side.total_in_room,
    participants: side.participants,
    requestable_count: side.requestable_count,
  };
}

/**
 * Highlights and room votes key on geo-chat's claim row. Explore falls back to the entity id for a
 * claim geo-chat has no row for yet, which those endpoints refuse.
 */
export function hasDebateClaimRow(claim: { id: string; claim_entity_id: string }) {
  return normId(claim.id) !== normId(claim.claim_entity_id);
}
