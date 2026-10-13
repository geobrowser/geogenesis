'use client';

import * as React from 'react';

import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { normId } from '~/core/utils/norm-id';

import type { DebateLobbyClaim, MatchmakingClaim } from '../api';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { type ClaimCardDefaults, ClaimsTab } from '../matchmaking/claims-tab';
import { LOBBY_CLAIMS_SCROLL_SELECTOR } from './lobby-claims-scroll';
import {
  exploreRoomClaimBatches,
  useLobbyExploreRoomClaims,
  useNearExploreBatches,
} from './lobby-explore-claims-hooks';
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
  const lobbyId = lobby.lobby_id;
  const [batches, setBatches] = React.useState<string[][]>([]);
  const onVisibleClaims = React.useCallback((entries: MatchmakingClaim[]) => {
    const next = exploreRoomClaimBatches(entries);
    setBatches(current => (sameBatches(current, next) ? current : next));
  }, []);
  const { active, onNear } = useNearExploreBatches(batches);
  const roomRows = useLobbyExploreRoomClaims(lobbyId, active);
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

  const renderClaim = React.useCallback(
    (entry: MatchmakingClaim, card: ClaimCardDefaults) => (
      <NearViewport claimEntityId={entry.claim.claim_entity_id} onNear={onNear}>
        <LobbyRoomClaimCard
          entry={exploreRoomClaim(entry, roomRows.get(claimRowKey(entry)))}
          answersReady={card.answersReady}
          renderOffer={renderOffer}
          renderMenu={hosting ? renderMenu : undefined}
        />
      </NearViewport>
    ),
    [hosting, onNear, renderMenu, renderOffer, roomRows]
  );

  // The tab pads its own controls and list, inside the claims pane's padding. On a desktop the pane
  // scrolls on its own, so the controls pin to its top; on a phone the page scrolls under the navbar
  // (`sticky top-0 h-11`), so they pin below that.
  return (
    <div className="-mx-4">
      <ClaimsTab
        variant="lobbyExplore"
        renderClaim={renderClaim}
        onVisibleClaims={onVisibleClaims}
        stickyTopClassName="top-0 md:top-11"
      />
    </div>
  );
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
  const { ref, nearViewport } = useNearViewport({ sticky: false, rootSelector: LOBBY_CLAIMS_SCROLL_SELECTOR });
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
