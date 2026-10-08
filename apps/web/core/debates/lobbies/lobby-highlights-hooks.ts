'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';

import {
  type DebateLobbyHighlights,
  type DebateLobbyRoomVote,
  dashlessId,
  endDebateLobbyRoomVote,
  getDebateLobbyHighlights,
  setDebateLobbyHighlight,
  setDebateLobbyRoomVoteHint,
  startDebateLobbyRoomVote,
} from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import {
  type LobbyHighlightsState,
  lobbyHighlightsFromResponse,
  roomVoteHintAction,
  settleFetchedLobbyHighlights,
  withLobbyHighlights,
} from './lobby-highlights-state';

/**
 * The lobby's highlights and room vote (GEO-3135). Fetched on mount and on gateway reconnect;
 * `debate.lobby_highlights_changed` replaces it in between.
 */
export function useLobbyHighlights(lobbyId: string, enabled = true) {
  const queryClient = useQueryClient();
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const queryKey = debateQueryKeys.lobbyHighlights(accountKey, lobbyId);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await getDebateLobbyHighlights(dashlessId(lobbyId), getPrivyIdentityToken, accountKey, signal);
      // An event can land while the GET is in flight; the newer state stands.
      return settleFetchedLobbyHighlights(
        queryClient.getQueryData<LobbyHighlightsState>(queryKey),
        lobbyHighlightsFromResponse(response)
      );
    },
    enabled: enabled && Boolean(lobbyId) && ready && authenticated,
  });
}

/** Lays a host action's returned state over the cache when newer, or seeds it after a failed first GET. */
function useStoreLobbyHighlights(lobbyId: string) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return (state: DebateLobbyHighlights) =>
    queryClient.setQueryData<LobbyHighlightsState>(debateQueryKeys.lobbyHighlights(accountKey, lobbyId), current =>
      withLobbyHighlights(current, state)
    );
}

/** Highlight or remove the highlight on one claim, by `DebateClaimSummary.id`. Host only. */
export function useSetLobbyHighlight(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyHighlights(lobbyId);

  return useMutation({
    mutationFn: ({ claimId, highlighted }: { claimId: string; highlighted: boolean }) =>
      setDebateLobbyHighlight(dashlessId(lobbyId), claimId, highlighted, getPrivyIdentityToken, accountKey),
    onSuccess: store,
  });
}

/** Ask the room to vote on a claim. `replace` ends a vote another host started. Host only. */
export function useStartLobbyRoomVote(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyHighlights(lobbyId);

  return useMutation({
    mutationFn: ({ claimId, replace }: { claimId: string; replace?: boolean }) =>
      startDebateLobbyRoomVote(
        dashlessId(lobbyId),
        { debate_claim_id: claimId, ...(replace ? { replace: true } : {}) },
        getPrivyIdentityToken,
        accountKey
      ),
    onSuccess: store,
  });
}

/** End the vote; its claim stays highlighted. Host only. */
export function useEndLobbyRoomVote(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyHighlights(lobbyId);

  return useMutation({
    mutationFn: (voteId: string) =>
      endDebateLobbyRoomVote(dashlessId(lobbyId), voteId, getPrivyIdentityToken, accountKey),
    onSuccess: store,
  });
}

/**
 * Counts the viewer's vote in the room tally while it indexes. Follows their write on the voted
 * claim from any surface: hints its side as it starts and withdraws the hint if it rolls back.
 * Only while they are in the room, which is all geo-chat accepts.
 */
export function useRoomVoteHint(lobbyId: string, vote: DebateLobbyRoomVote | null, inRoom: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const snapshot = useEntityResponseIndexingSnapshot({
    entityId: vote?.claim.claim_entity_id ?? '',
    spaceId: vote?.claim.space_id ?? '',
    responseKind: CLAIM_RESPONSE_KIND,
  });
  const voteId = vote?.vote_id ?? null;
  const tracking = React.useRef<{ voteId: string | null; hinted: string | null }>({ voteId: null, hinted: null });

  React.useEffect(() => {
    if (!voteId || !inRoom) return;
    if (tracking.current.voteId !== voteId) tracking.current = { voteId, hinted: null };
    const state = tracking.current;
    const action = roomVoteHintAction(snapshot, state.hinted);
    if (!action) return;

    const send = (position: boolean | null | undefined) =>
      setDebateLobbyRoomVoteHint(dashlessId(lobbyId), voteId, position, getPrivyIdentityToken, accountKey).catch(
        // A refused hint leaves the tally to the response-indexed report.
        () => undefined
      );
    if (action.kind === 'hint') {
      state.hinted = action.runId;
      void send(action.position);
    } else if (action.kind === 'withdraw') {
      state.hinted = null;
      void send(undefined);
    } else {
      state.hinted = null;
    }
  }, [accountKey, getPrivyIdentityToken, inRoom, lobbyId, snapshot, voteId]);
}
