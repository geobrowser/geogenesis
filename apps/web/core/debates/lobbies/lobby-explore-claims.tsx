'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import type { DebateLobbyClaim, MatchmakingClaim } from '../api';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { type ClaimCardDefaults, ClaimsTab } from '../matchmaking/claims-tab';
import { exploreRoomClaimBatches, useLobbyExploreRoomClaims } from './lobby-explore-claims-hooks';
import { LobbyClaimHostMenu } from './lobby-highlights';
import { useLobbyHighlights } from './lobby-highlights-hooks';
import { LobbyClaimRequest, lobbyRoomClaimFrom } from './lobby-room-claims';
import { type LobbyRoomClaim, LobbyRoomClaimCard, type LobbyRoomOffer } from './lobby-room-claims-list';
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
  const roomRows = useLobbyExploreRoomClaims(lobbyId, batches);
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
      <LobbyRoomClaimCard
        entry={exploreRoomClaim(entry, roomRows.get(claimRowKey(entry)))}
        answersReady={card.answersReady}
        renderOffer={renderOffer}
        renderMenu={hosting ? renderMenu : undefined}
      />
    ),
    [hosting, renderMenu, renderOffer, roomRows]
  );

  return <ClaimsTab variant="explore" renderClaim={renderClaim} onVisibleClaims={onVisibleClaims} />;
}

function sameBatches(a: string[][], b: string[][]) {
  return a.length === b.length && a.every((batch, index) => batch.join(',') === b[index]!.join(','));
}

/**
 * An Explore row as the room card reads it: the room's sides where geo-chat has an entry for it,
 * otherwise (nobody in the room holds a side, or a guest) the tab's own sides, marked as not the room's.
 */
export function exploreRoomClaim(entry: MatchmakingClaim, roomRow: DebateLobbyClaim | undefined): LobbyRoomClaim {
  if (roomRow) return lobbyRoomClaimFrom(roomRow);
  return {
    claim: entry.claim,
    readiness: entry,
    activeDebate: entry.active_debate,
    positions: entry.positions.map(side => ({ ...side, requestable_count: 0 })),
    outsideRoom: true,
  };
}

/**
 * Highlights and room votes key on geo-chat's claim row. Explore falls back to the entity id for a
 * claim geo-chat has no row for yet, which those endpoints refuse.
 */
export function hasDebateClaimRow(claim: { id: string; claim_entity_id: string }) {
  return normId(claim.id) !== normId(claim.claim_entity_id);
}
