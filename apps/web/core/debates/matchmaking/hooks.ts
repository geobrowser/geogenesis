'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRouter } from 'next/navigation';

import {
  type CreateDebateRequestBody,
  type DismissDebateRequestBody,
  type MatchmakingClaimsQuery,
  acceptDebateRequest,
  blockDebateUser,
  createDebateRequest,
  dismissDebateRequest,
  listDebateBlocks,
  listDebatePeople,
  listDebateRequests,
  listMatchmakingClaims,
  listMatchmakingMatches,
  unblockDebateUser,
  withdrawDebateRequest,
} from '../api';
import { markEnteringDebate, markEnteringPendingDebate } from '../debate-entry-intent';
import { useDebateGatewayScope } from '../debate-gateway';
import { debatePath } from '../debate-routes';
import {
  debateQueryKeys,
  debateQueryNetworkOptions,
  invalidateDebatesOutsideRematchClaims,
  useGeoChatAuth,
} from '../hooks';

const MATCHMAKING_CLAIMS_PAGE_SIZE = 20;

/**
 * Every hub query lives under the account-scoped `['debates','account',key,…]` shape the gateway
 * invalidates, and the panel holds the `matchmaking` gateway scope for as long as it is open.
 *
 * The panel owns it, not the individual tabs: tabs cross-fade with `mode="wait"`, so the outgoing
 * one unmounts before the incoming one mounts. Held per tab, the refcount dropped to zero on every
 * switch and the round trip that followed — UNSUBSCRIBE, SUBSCRIBE, READY — re-reconciled the whole
 * scope, refetching every loaded claims page and eating into the session's SUBSCRIBE budget.
 */
/**
 * Subscribes to matchmaking's live updates, which need a session, and reports whether there is one.
 *
 * The two used to be the same answer: no session meant no socket *and* no list. Claims and People
 * are readable signed out now (GEO-2725), so the socket stays gated while the lists no longer are
 * — a signed-out viewer gets a static list rather than none, which is the trade the hub wants.
 */
/**
 * Whether a previous query's key belongs to the account asking now.
 *
 * `debateQueryKeys.matchmakingClaims` puts `accountKey` in the key, so comparing that one element
 * is enough — and it is read positionally because the key is built here and nowhere else.
 */
function sameQueryAccount(previousKey: readonly unknown[], accountKey: string | null) {
  return previousKey[2] === accountKey;
}

export function useMatchmakingScope(enabled: boolean) {
  const { authenticated } = useGeoChatAuth();
  useDebateGatewayScope({ scope: 'matchmaking' }, enabled && authenticated);
  return authenticated;
}

export function useDebatePeople(enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  useMatchmakingScope(enabled);

  return useQuery({
    ...debateQueryNetworkOptions,
    // `accountKey` is null signed out, which keys the anonymous list separately from anyone's —
    // so signing in cannot serve the signed-out answer, and signing out cannot leak the other way.
    queryKey: debateQueryKeys.people(accountKey),
    queryFn: ({ signal }) => listDebatePeople(getPrivyIdentityToken, accountKey, signal),
    enabled,
    // Presence is the most volatile thing the hub shows, and coming back to the window is exactly
    // when it is most likely to have moved on without us.
    refetchOnWindowFocus: true,
  });
}

export function useMatchmakingClaims(query: MatchmakingClaimsQuery, enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  useMatchmakingScope(enabled);

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
    // Changing a filter or typing in search changes the query key; without this the list would be
    // replaced by a skeleton on every keystroke.
    //
    // Only within one account, though. Signing out changes `accountKey` in the key too, and holding
    // the previous pages through that would render the signed-in list — `mine` results, viewer
    // readiness — as the anonymous answer until the new request lands. A skeleton is the honest
    // state there, so the carry-over is dropped when the account behind the previous query differs.
    placeholderData: (previousData, previousQuery) =>
      previousQuery && !sameQueryAccount(previousQuery.queryKey, accountKey) ? undefined : previousData,
    enabled,
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
    refetchOnWindowFocus: true,
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

export function useCreateDebateRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: CreateDebateRequestBody) => createDebateRequest(request, getPrivyIdentityToken, accountKey),
    // On the refusal as well as on the acceptance.
    //
    // `/matchmaking/matches` is looser than this endpoint — it omits the `validation_failed_at IS
    // NULL` / `last_validated_at IS NOT NULL` predicates and the attempted-recipient exclusion — and
    // it is fetched once, with `refetchOnWindowFocus` off. So a match that has since evaporated
    // (opponent taken, already requested, readiness swept) stays in the cache drawing a live button,
    // and refusing without refetching left the reader pressing it into the same error. A refusal is
    // the server telling us the list is wrong; the only wrong thing to do with that is nothing.
    onSettled: () => void invalidateDebatesOutsideRematchClaims(queryClient),
  });
}

export function useWithdrawDebateRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (requestId: string) => withdrawDebateRequest(requestId, getPrivyIdentityToken, accountKey),
    onSuccess: () => void invalidateDebatesOutsideRematchClaims(queryClient),
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
    onSuccess: () => void invalidateDebatesOutsideRematchClaims(queryClient),
  });
}

/**
 * Accepting creates the debate outright — GEO-2514 left requests as the only route into one — so
 * this tab walks straight into the room, which owns the camera/mic pre-screen while the debate is
 * `ready`. The other side is told by `DebateReadyPrompt` off its own activity.
 */
export function useAcceptDebateRequest() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ requestId, formatId }: { requestId: string; formatId?: string }) =>
      acceptDebateRequest(requestId, getPrivyIdentityToken, accountKey, formatId),
    // Claimed before the request leaves, released when it settles. The id-keyed intent below cannot
    // be taken until the response names the debate, and the server emits `debate.state_changed` to
    // this very tab on the way — so without this the coordinator gets a `ready` debate off our own
    // socket event, mid-round-trip, and prompts us to join what we are already accepting (GEO-2604).
    onMutate: () => ({ releaseEntry: markEnteringPendingDebate() }),
    onSettled: (_result, _error, _variables, context) => context?.releaseEntry(),
    onSuccess: result => {
      if (result.debate) {
        queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
        // Before the push, and before the invalidation below: the room is a server segment with no
        // `loading` boundary, so this page stays up while activity comes back reporting a debate
        // this tab is not yet on the path of. Without the intent the coordinator reads that as
        // someone who needs telling and reopens this very dialog as the ready prompt.
        markEnteringDebate(result.debate.id);
        router.push(debatePath(result.debate));
      }
      void invalidateDebatesOutsideRematchClaims(queryClient);
    },
  });
}

export function useBlockDebateUser() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (userId: string) => blockDebateUser(userId, getPrivyIdentityToken, accountKey),
    onSuccess: () => void invalidateDebatesOutsideRematchClaims(queryClient),
  });
}

export function useUnblockDebateUser() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (userId: string) => unblockDebateUser(userId, getPrivyIdentityToken, accountKey),
    onSuccess: () => void invalidateDebatesOutsideRematchClaims(queryClient),
  });
}
