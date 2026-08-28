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

/**
 * Readiness for one claim. A position is an on-chain claim response, so the hub can only turn
 * readiness on (the server requires an indexed active response) or off — it never sends a side.
 * Both directions are the plain queue endpoints, keyed per claim so cards can pass their own space.
 */
/**
 * Every cached family that carries `viewer_debate_ready`, so the switch moves in whichever surface
 * the viewer is looking at. `['debates', 'claims']` is the per-space family the rematch picker
 * reads; leaving it out left that toggle unmoved until the settle refetch landed.
 */
const READINESS_FAMILIES = (accountKey: string | null) =>
  [
    debateQueryKeys.matchmakingClaimsRoot(accountKey),
    debateQueryKeys.matches(accountKey),
    ['debates', 'claims'],
  ] as const;

export function useClaimReadiness() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ spaceId, claimId, ready }: { spaceId: string; claimId: string; ready: boolean }) =>
      ready
        ? joinDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey)
        : leaveDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey),
    // The switch moves now rather than a round trip and a refetch later, mirroring the
    // availability switch in the panel header.
    onMutate: async ({ spaceId, claimId, ready }) => {
      const families = READINESS_FAMILIES(accountKey);
      await Promise.all(families.map(queryKey => queryClient.cancelQueries({ queryKey })));
      for (const queryKey of families) {
        queryClient.setQueriesData({ queryKey }, (current: unknown) =>
          patchClaimReadiness(current, spaceId, claimId, ready)
        );
      }
    },
    // Undo just this claim rather than restoring a snapshot of both families: every card holds its
    // own copy of this mutation, so a snapshot rollback would also revert a toggle on another claim
    // and any gateway refetch that landed in between.
    onError: (_error, { spaceId, claimId, ready }) => {
      for (const queryKey of READINESS_FAMILIES(accountKey)) {
        queryClient.setQueriesData({ queryKey }, (current: unknown) =>
          patchClaimReadiness(current, spaceId, claimId, !ready)
        );
      }
    },
    // Readiness changes who is matchable, so let the server re-sort — but only the families it
    // actually affects, rather than every debate query.
    onSettled: () => {
      for (const queryKey of [
        debateQueryKeys.matchmakingClaimsRoot(accountKey),
        debateQueryKeys.matches(accountKey),
        debateQueryKeys.activity(accountKey),
        ['debates', 'claims'] as const,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

/**
 * Flips `viewer_debate_ready` on one claim wherever it appears, in both the flat matches response
 * and the paged claims response. Anything else is returned untouched.
 *
 * Readiness is per (space, claim): geo-chat keys it on `(public_dao_space_id, claim_entity_id)`,
 * and the Claims tab is cross-space, so the same claim entity can hold two rows with different
 * readiness. Matching on the entity alone would move both switches for one round trip.
 */
function patchClaimReadiness(data: unknown, spaceId: string, claimId: string, ready: boolean): unknown {
  const patchOne = <T extends { claim: { space_id: string; claim_entity_id: string }; viewer_debate_ready: boolean }>(
    entry: T
  ) =>
    entry.claim.claim_entity_id === claimId && entry.claim.space_id === spaceId
      ? { ...entry, viewer_debate_ready: ready }
      : entry;

  if (!data || typeof data !== 'object') return data;

  // The per-space family (`DebateClaimsResponse`) keys the ids on the entry itself rather than
  // nesting them under `claim`, so it needs its own matcher.
  const patchFlat = <T extends { space_id: string; claim_entity_id: string; viewer_debate_ready: boolean }>(
    entry: T
  ) =>
    entry.claim_entity_id === claimId && entry.space_id === spaceId ? { ...entry, viewer_debate_ready: ready } : entry;

  if ('matches' in data && Array.isArray(data.matches)) {
    return { ...data, matches: data.matches.map(patchOne) };
  }

  if ('claims' in data && Array.isArray(data.claims)) {
    return {
      ...data,
      claims: data.claims.map((entry: unknown) =>
        entry && typeof entry === 'object' && 'claim_entity_id' in entry ? patchFlat(entry as never) : entry
      ),
    };
  }

  if ('pages' in data && Array.isArray(data.pages)) {
    return {
      ...data,
      pages: data.pages.map((page: unknown) =>
        page && typeof page === 'object' && 'claims' in page && Array.isArray(page.claims)
          ? { ...page, claims: page.claims.map(patchOne) }
          : page
      ),
    };
  }

  return data;
}

export function useCreateDebateRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: CreateDebateRequestBody) => createDebateRequest(request, getPrivyIdentityToken, accountKey),
    onSuccess: () => void invalidateDebatesOutsideRematchClaims(queryClient),
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
