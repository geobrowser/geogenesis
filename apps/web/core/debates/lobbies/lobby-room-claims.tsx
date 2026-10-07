'use client';

import * as React from 'react';

import { claimRequestBlockedReason, debateRequestErrorMessage } from '~/core/claims/browse/use-claim-matchup';

import { type DebateLobbyClaim, type DebateLobbyView, dashlessId } from '../api';
import { useDebateActivity } from '../hooks';
import { useCreateDebateRequest, useDebateRequests } from '../matchmaking/hooks';
import { HubMessageNote, HubQueryState } from '../matchmaking/hub-states';
import { RequestDebateControl } from '../request-debate-control';
import { lobbyClaimRequestErrorMessage, useDebateLobbyClaims } from './lobby-room-claims-hooks';
import { type LobbyRoomClaim, LobbyRoomClaimsList, type LobbyRoomOffer } from './lobby-room-claims-list';

export const LOBBY_ROOM_CLAIMS_COPY = {
  empty: 'Nobody here has taken a side on a claim yet.',
  recent: 'Nobody here has taken a side yet. These claims were voted on recently.',
  confirming: 'Confirming your side…',
} as const;

/**
 * The lobby's "In this room" claims (GEO-3132), in the server's order. `excludeClaimIds` drops rows
 * by `DebateClaimSummary.id`, for a host that shows some of them elsewhere.
 */
export function LobbyRoomClaims({
  lobby,
  excludeClaimIds,
  onExplore,
}: {
  lobby: DebateLobbyView;
  excludeClaimIds?: ReadonlySet<string>;
  /** Offered when the list is empty. */
  onExplore?: () => void;
}) {
  const query = useDebateLobbyClaims(lobby.lobby_id);
  const source = query.data?.source ?? 'room';
  const claims = React.useMemo(
    () =>
      (query.data?.claims ?? []).filter(row => !excludeClaimIds?.has(row.claim.id)).map(row => lobbyRoomClaimFrom(row)),
    [excludeClaimIds, query.data?.claims]
  );

  const renderOffer = React.useCallback(
    (offer: LobbyRoomOffer) => <LobbyClaimRequest lobbyId={lobby.lobby_id} offer={offer} />,
    [lobby.lobby_id]
  );

  return (
    <HubQueryState
      analyticsSurface="hub"
      isLoading={query.isLoading}
      error={query.error}
      failureReason={query.failureReason}
      onRetry={() => void query.refetch()}
      isEmpty={claims.length === 0}
      emptyMessage={LOBBY_ROOM_CLAIMS_COPY.empty}
      emptyAction={onExplore ? { label: 'Explore claims', onClick: onExplore } : undefined}
    >
      {source === 'recent' ? (
        <div className="pb-2">
          <HubMessageNote>{LOBBY_ROOM_CLAIMS_COPY.recent}</HubMessageNote>
        </div>
      ) : null}
      <LobbyRoomClaimsList claims={claims} renderOffer={renderOffer} />
    </HubQueryState>
  );
}

/**
 * The row as the card reads it. geo-chat leaves the viewer out of `positions`; they are counted
 * back on their own side so the card's optimistic move between sides keeps the totals right.
 */
export function lobbyRoomClaimFrom(row: DebateLobbyClaim): LobbyRoomClaim {
  const viewerSide = row.viewer_response?.position ?? null;
  return {
    claim: row.claim,
    readiness: {
      response_kind: row.response_kind,
      viewer_response: row.viewer_response,
      viewer_debate_ready: row.viewer_debate_ready,
      readiness_disabled_reason: row.readiness_disabled_reason,
    },
    activeDebate: row.active_debate,
    positions: row.positions.map(side => {
      const total = side.total_in_room + (side.position === viewerSide ? 1 : 0);
      return {
        position: side.position,
        position_label: side.position_label,
        total_count: total,
        available_now_count: side.requestable_count,
        present_count: total,
        participants: side.participants,
        requestable_count: side.requestable_count,
      };
    }),
  };
}

/** Request debate, offered only to people in this lobby on the other side. */
function LobbyClaimRequest({ lobbyId, offer }: { lobbyId: string; offer: LobbyRoomOffer }) {
  const { claim, readiness } = offer.entry;
  const { data: activity } = useDebateActivity(true);
  const { data: requests } = useDebateRequests(true);
  const createRequest = useCreateDebateRequest();
  const blockedReason = claimRequestBlockedReason(activity, requests);
  // geo-chat refuses the request until it holds the viewer's side, which a vote from this list
  // reaches only once its response-indexed report returns and the list refetches.
  const sideConfirming = readiness.viewer_response?.position !== offer.viewerPosition;

  return (
    <RequestDebateControl
      onRequest={() =>
        createRequest.mutate({
          space_id: claim.space_id,
          claim_entity_id: claim.claim_entity_id,
          lobby_id: dashlessId(lobbyId),
        })
      }
      disabled={Boolean(blockedReason)}
      blockedReason={blockedReason}
      isRequesting={createRequest.isPending}
      pending={sideConfirming}
      pendingLabel={LOBBY_ROOM_CLAIMS_COPY.confirming}
      requestError={
        lobbyClaimRequestErrorMessage(createRequest.error) ??
        debateRequestErrorMessage(createRequest.error, offer.viewerPosition)
      }
    />
  );
}
