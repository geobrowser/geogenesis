'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type CreateDebateRequestBody,
  type DismissDebateRequestBody,
  type MatchmakingClaimsQuery,
  acceptDebateRequest,
  blockDebateUser,
  createDebateRequest,
  dismissDebateRequest,
  joinDebateQueue,
  leaveDebateQueue,
  listDebateBlocks,
  listDebatePeople,
  listDebateRequests,
  listMatchmakingClaims,
  listMatchmakingMatches,
  unblockDebateUser,
  withdrawDebateRequest,
} from '../api';
import { useDebateGatewayScope } from '../debate-gateway';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';

const MATCHMAKING_CLAIMS_PAGE_SIZE = 20;

/**
 * Every hub query lives under the account-scoped `['debates','account',key,…]` shape the gateway
 * invalidates, and holds the `matchmaking` gateway scope only while the panel is open.
 */
function useMatchmakingScope(enabled: boolean) {
  const { authenticated } = useGeoChatAuth();
  useDebateGatewayScope({ scope: 'matchmaking' }, enabled && authenticated);
  return authenticated;
}

export function useDebatePeople(enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const authenticated = useMatchmakingScope(enabled);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.people(accountKey),
    queryFn: ({ signal }) => listDebatePeople(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
  });
}

export function useMatchmakingClaims(query: MatchmakingClaimsQuery, enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const authenticated = useMatchmakingScope(enabled);

  return useInfiniteQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.matchmakingClaims(accountKey, query),
    queryFn: ({ pageParam, signal }) =>
      listMatchmakingClaims(
        { ...query, cursor: pageParam, limit: MATCHMAKING_CLAIMS_PAGE_SIZE },
        getPrivyIdentityToken,
        accountKey,
        signal
      ),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.next_cursor,
    enabled: enabled && authenticated,
  });
}

export function useMatchmakingMatches(enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const authenticated = useMatchmakingScope(enabled);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.matches(accountKey),
    queryFn: ({ signal }) => listMatchmakingMatches(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
  });
}

/**
 * Incoming + outbound requests. `debate.requests_changed` is account-scoped and needs no
 * subscription, so this stays fresh even when the hub is closed (the coordinator needs it for the
 * incoming-request popup).
 */
export function useDebateRequests(enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.requests(accountKey),
    queryFn: ({ signal }) => listDebateRequests(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
  });
}

export function useDebateBlocks(enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.blocks(accountKey),
    queryFn: ({ signal }) => listDebateBlocks(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
  });
}

/**
 * Readiness for one claim. A position is an on-chain claim response, so the hub can only turn
 * readiness on (the server requires an indexed active response) or off — it never sends a side.
 * Both directions are the plain queue endpoints, keyed per claim so cards can pass their own space.
 */
export function useClaimReadiness() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ spaceId, claimId, ready }: { spaceId: string; claimId: string; ready: boolean }) =>
      ready
        ? joinDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey)
        : leaveDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}

export function useCreateDebateRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: CreateDebateRequestBody) => createDebateRequest(request, getPrivyIdentityToken, accountKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}

export function useWithdrawDebateRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (requestId: string) => withdrawDebateRequest(requestId, getPrivyIdentityToken, accountKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}

export function useDismissDebateRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ requestId, removeIntent }: { requestId: string; removeIntent?: boolean }) => {
      const body: DismissDebateRequestBody = removeIntent ? { remove_intent: true } : {};
      return dismissDebateRequest(requestId, body, getPrivyIdentityToken, accountKey);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}

/**
 * Accepting produces the match + debate('ready') that the existing prompt/pre-screen machinery
 * consumes, so we seed those caches the same way `useAcceptDebateMatch` does.
 */
export function useAcceptDebateRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ requestId, formatId }: { requestId: string; formatId?: string }) =>
      acceptDebateRequest(requestId, getPrivyIdentityToken, accountKey, formatId),
    onSuccess: result => {
      if (result.debate) {
        queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
      }
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
    },
  });
}

export function useBlockDebateUser() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (userId: string) => blockDebateUser(userId, getPrivyIdentityToken, accountKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}

export function useUnblockDebateUser() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (userId: string) => unblockDebateUser(userId, getPrivyIdentityToken, accountKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}
