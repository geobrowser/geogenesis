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
import { viewerReadRetryOptions } from '../matchmaking/hooks';
import {
  type LobbyHighlightsState,
  createRoomVoteHintSender,
  lobbyHighlightsFromResponse,
  roomVoteHintAction,
  settleFetchedLobbyHighlights,
  withLobbyHighlights,
} from './lobby-highlights-state';

/**
 * The lobby's highlights and room vote (GEO-3135). Fetched on mount and on gateway reconnect;
 * `debate.lobby_highlights_changed` replaces it in between. A failed GET retries: with no running
 * vote, nothing else would bring the highlights back.
 */
export function useLobbyHighlights(lobbyId: string, enabled = true) {
  const queryClient = useQueryClient();
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const queryKey = debateQueryKeys.lobbyHighlights(accountKey, lobbyId);

  return useQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
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
 * Only while they are in the room, which is all geo-chat accepts. Hints go one at a time per vote,
 * latest wins (see `createRoomVoteHintSender`).
 */
export function useRoomVoteHint(lobbyId: string, vote: DebateLobbyRoomVote | null, inRoom: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const snapshot = useEntityResponseIndexingSnapshot({
    entityId: vote?.claim.claim_entity_id ?? '',
    spaceId: vote?.claim.space_id ?? '',
    responseKind: CLAIM_RESPONSE_KIND,
  });
  const voteId = vote?.vote_id ?? null;
  const tracking = React.useRef<{
    key: string | null;
    hinted: string | null;
    sender: ReturnType<typeof createRoomVoteHintSender> | null;
  }>({ key: null, hinted: null, sender: null });

  React.useEffect(() => {
    if (!voteId || !inRoom) return;
    const key = `${dashlessId(lobbyId)}:${voteId}`;
    if (tracking.current.key !== key) {
      tracking.current.sender?.close(false);
      tracking.current = {
        key,
        hinted: null,
        sender: createRoomVoteHintSender(request =>
          // A refused hint leaves the tally to the response-indexed report.
          setDebateLobbyRoomVoteHint(dashlessId(lobbyId), voteId, request, getPrivyIdentityToken, accountKey)
        ),
      };
    }
    const state = tracking.current;
    const action = roomVoteHintAction(snapshot, state.hinted);
    if (!action) return;

    if (action.kind === 'hint') {
      state.hinted = action.runId;
      state.sender?.request(action.position);
    } else if (action.kind === 'withdraw') {
      state.hinted = null;
      state.sender?.request(undefined);
    } else {
      state.hinted = null;
      state.sender?.forget();
    }
  }, [accountKey, getPrivyIdentityToken, inRoom, lobbyId, snapshot, voteId]);

  // Unmounting drops queued hints but still sends a queued withdrawal. The ref is cleared so a
  // remount (Strict Mode runs one) builds a fresh sender.
  React.useEffect(
    () => () => {
      tracking.current.sender?.close(true);
      tracking.current = { key: null, hinted: null, sender: null };
    },
    []
  );
}
