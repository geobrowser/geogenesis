'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useActionContext } from '~/core/action-context-provider';
import { PEER_SCHEDULE_DAYS } from '~/core/availability/peer-schedule';
import { useParticipantAvatars, withRowParticipantAvatars } from '~/core/debates/participant-avatars';
import { withQueryData } from '~/core/debates/with-query-data';
import { useObservedMutation } from '~/core/hooks/use-observed-mutation';
import { normId } from '~/core/utils/norm-id';

import {
  type AnnotatedSlot,
  type CreateDebateRequestBody,
  type DebateParticipantSummary,
  type DebatePerson,
  type DebateRequest,
  type DebateRequestParty,
  type DismissDebateRequestBody,
  GeoChatRequestError,
  type MatchmakingClaimsQuery,
  acceptDebateRequest,
  blockDebateUser,
  createDebateRequest,
  dismissDebateRequest,
  getScheduleOverlaps,
  isAccountWarmingUp,
  listDebateBlocks,
  listDebatePeople,
  listDebateRequests,
  listMatchmakingClaims,
  listMatchmakingMatches,
  listSchedulablePeople,
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

/** Stable empty references, so an unresolved query does not hand the memos a new array each render. */
const EMPTY_PEOPLE: DebatePerson[] = [];
const EMPTY_PARTIES: DebateRequestParty[] = [];
const EMPTY_PARTICIPANTS: DebateParticipantSummary[] = [];

/** How many times a viewer-relative read that might yet succeed repeats before it is called failed. */
const TRANSIENT_RETRIES = 3;

/**
 * And how many times one refused for an account that does not exist *yet*.
 *
 * Longer because the thing it is waiting for is longer: a fresh sign-up was refused for a minute or
 * two before geo-chat had registered it.
 *
 * Nine because the backoff is what it is, and six did not reach where the comment here claimed it
 * did. `failureCount` is zero-based, so six retries wait 0.5 + 1 + 2 + 4 + 8 + 16 — thirty-one
 * seconds, not the minute this is for, and the last three of those land inside the first half of a
 * window that runs twice as long. Nine carries it to about ninety seconds on the 20s cap, which
 * covers the case rather than stopping just short of it. After that the viewer is told what is
 * happening and can ask again themselves.
 */
const WARMING_UP_RETRIES = 9;

/**
 * Every query in this file is keyed on the viewer's account, and they all fail together for an
 * account geo-chat has not finished registering.
 *
 * Reported from a fresh sign-up: the hub sat in "Something went wrong" for a minute or two, on a
 * backend that was about to work. Nothing here refetches on focus or reconnect, and
 * `debateQueryNetworkOptions` does not retry — deliberately, because a public read answered 503
 * should be one request rather than four — so a first read that failed stayed failed until the
 * viewer pressed "Try again" or the panel remounted.
 *
 * Viewer-relative reads want the opposite of that. They are made once per panel open, by one
 * account, and the failure they actually meet is a backend catching up with a viewer who exists.
 *
 * Only what might change, though. A 4xx is geo-chat telling us something — the sign-in refusal, the
 * 404 that means matchmaking is not deployed, the 400 that means the request was malformed — and
 * asking again gets the same answer. Those still surface at once.
 */
const viewerReadRetryOptions = (accountKey: string | null) => ({
  retry: (failureCount: number, error: Error) => {
    // An account geo-chat has not registered yet is the long one. It refuses the session exchange
    // with a 401 and keeps refusing for a minute or two after sign-up, then simply starts working —
    // so this waits it out rather than handing the viewer a button as the only way through.
    // Only for a viewer we have an identity for. Without one a refusal is the plain refusal it
    // looks like — the hub asks for its anonymous lists without a token, and geo-chat is entitled to
    // say no — and `isSignInRequired` turns that into the sign-in prompt at once. Waiting a minute
    // first would be waiting for something that is not coming.
    if (accountKey && isAccountWarmingUp(error)) {
      return failureCount < WARMING_UP_RETRIES;
    }
    if (failureCount >= TRANSIENT_RETRIES) return false;
    if (error instanceof GeoChatRequestError) return error.status >= 500;
    // Not a reply at all — a dropped connection, a parse failure — which is the other kind of maybe.
    return true;
  },
  // Half a second, then one, two, four: short enough at the start to read as loading rather than as
  // a wait, and long enough by the end to sit out a registration without asking sixty times.
  retryDelay: (failureCount: number) => Math.min(500 * 2 ** failureCount, 20_000),
});

export function useDebatePeople(enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  useMatchmakingScope(enabled);

  const query = useQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
    // `accountKey` is null signed out, which keys the anonymous list separately from anyone's —
    // so signing in cannot serve the signed-out answer, and signing out cannot leak the other way.
    queryKey: debateQueryKeys.people(accountKey),
    queryFn: ({ signal }) => listDebatePeople(getPrivyIdentityToken, accountKey, signal),
    enabled,
    // Presence is the most volatile thing the hub shows, and coming back to the window is exactly
    // when it is most likely to have moved on without us.
    refetchOnWindowFocus: true,
  });

  // geo-chat's `avatar_cid` is a snapshot of the profile taken when it first learned about someone,
  // so an avatar uploaded afterwards never reaches it and the row draws a placeholder for a face
  // the profile page renders fine. Resolved here rather than in the rows so every consumer of this
  // list gets it. See `participant-avatars`.
  const people = React.useMemo(() => query.data?.people ?? EMPTY_PEOPLE, [query.data]);
  const withAvatar = useParticipantAvatars(people, enabled);

  const data = React.useMemo(
    () => (query.data ? { ...query.data, people: people.map(withAvatar) } : query.data),
    [query.data, people, withAvatar]
  );

  return withQueryData(query, data);
}

/**
 * Fixed so every caller shares one cache entry. geo-chat's range is inclusive, so this is the modal's
 * seven days. The limit leaves room for a day of past slots, which geo-chat returned before
 * geo-chat#165 and no longer does; kept so this works against either build.
 */
const SCHEDULABLE_DAYS = PEER_SCHEDULE_DAYS - 1;
const SCHEDULABLE_SLOTS = 48 + 3;

/**
 * Find a time's window (GEO-3152): this week and next, which from a Sunday is fourteen days out.
 * geo-chat's range is inclusive and counts from today's UTC date, so the far edge can run a day
 * past next Sunday; the grid drops anything outside the two weeks it draws.
 */
export const FIND_A_TIME_DAYS = 14;
/**
 * Only read where `their_windows` is missing (a geo-chat predating it), when the shared slots are
 * all there is to draw. A fortnight of half-hours, so that fallback is never cut short.
 */
const FIND_A_TIME_SLOTS = FIND_A_TIME_DAYS * 48;

/**
 * Everyone with free time this week, online or not, shared slots first (GEO-2937).
 *
 * `full` is Find a time (GEO-3152): a fortnight, listed even when the viewer has no schedule, with
 * each person's whole free time. Its own cache entry, so the People tab's answer is untouched.
 */
export function useSchedulablePeople(
  enabled: boolean,
  { full = false, spaces = EMPTY_SPACES }: { full?: boolean; spaces?: string[] } = {}
) {
  const days = full ? FIND_A_TIME_DAYS : SCHEDULABLE_DAYS;
  // Only Find a time narrows on the server, and only once the unfiltered list hit its cap: below
  // that, every candidate is already in hand and the space menu filters them where they are.
  const serverSpaces = React.useMemo(() => (full ? [...spaces].sort() : EMPTY_SPACES), [full, spaces]);
  const limit = full ? FIND_A_TIME_SLOTS : SCHEDULABLE_SLOTS;
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const queryEnabled = enabled && authenticated;

  const query = useQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
    queryKey: debateQueryKeys.schedulablePeople(accountKey, days, limit, full, serverSpaces),
    queryFn: ({ signal }) =>
      listSchedulablePeople({ days, limit, full, spaces: serverSpaces }, getPrivyIdentityToken, accountKey, signal),
    // A new space selection keeps the last week drawn while the narrowed one loads.
    placeholderData: full ? keepPreviousData : undefined,
    enabled: queryEnabled,
  });

  // geo-chat's `avatar_cid` is a first-sight snapshot; see `useDebatePeople`.
  const users = React.useMemo(() => query.data?.people.map(person => person.user) ?? EMPTY_SUMMARIES, [query.data]);
  const withAvatar = useParticipantAvatars(users, queryEnabled);

  const data = React.useMemo(
    () =>
      query.data
        ? { ...query.data, people: query.data.people.map(person => ({ ...person, user: withAvatar(person.user) })) }
        : query.data,
    [query.data, withAvatar]
  );

  return withQueryData(query, data);
}

/**
 * The most weeks Find a time asks for one by one. The list is ordered with the people most worth
 * debating first, so a cap keeps the ones that matter; it exists so a long list cannot fire hundreds
 * of requests from one page load.
 */
export const PEER_WEEKS_CAP = 100;

/**
 * Each person's whole free time, one `/matchmaking/schedule-overlaps` read each: the read their
 * Schedule week already makes (GEO-3152).
 *
 * The schedulable list only carries the times a person shares with the viewer. Until geo-chat sends
 * everyone's own free time in that one answer, this asks for it person by person. Keyed per person,
 * so each is cached on its own and a list that gains someone fetches only them.
 */
export function usePeerWeeks(userIds: string[], enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const ids = userIds.slice(0, PEER_WEEKS_CAP);

  const results = useQueries({
    queries: ids.map(userId => ({
      ...debateQueryNetworkOptions,
      queryKey: debateQueryKeys.peerSchedule(accountKey, userId, FIND_A_TIME_DAYS),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getScheduleOverlaps(userId, { days: FIND_A_TIME_DAYS }, getPrivyIdentityToken, accountKey, signal),
      enabled: enabled && authenticated,
      // Free time moves slowly; a viewer paging weeks should not refetch two hundred people.
      staleTime: 5 * 60_000,
    })),
  });

  return React.useMemo(() => {
    const byUser = new Map<string, AnnotatedSlot[]>();
    let pending = 0;
    results.forEach((result, index) => {
      if (result.data?.their_slots) byUser.set(normId(ids[index]), result.data.their_slots);
      else if (result.isPending && enabled) pending++;
    });
    return { byUser, pending, capped: userIds.length > ids.length };
    // `results` is a new array every render; its data is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map(result => result.dataUpdatedAt).join(), enabled, ids.join(), userIds.length]);
}

const EMPTY_SUMMARIES: DebateParticipantSummary[] = [];
const EMPTY_SPACES: string[] = [];

export function useMatchmakingClaims(query: MatchmakingClaimsQuery, enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  useMatchmakingScope(enabled);

  const infinite = useInfiniteQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
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

  // The faces on the claim pills, which hang off each side rather than a flat participant list.
  // Flattened across every loaded page so the whole list resolves in one batch — see
  // `useDebatePeople` for why this happens here rather than in `PositionAvatars`.
  const participants = React.useMemo(
    () =>
      infinite.data?.pages.flatMap(page =>
        page.claims.flatMap(claim => claim.positions.flatMap(position => position.participants))
      ) ?? EMPTY_PARTICIPANTS,
    [infinite.data]
  );

  const withAvatar = useParticipantAvatars(participants, enabled);

  const data = React.useMemo(() => {
    if (!infinite.data) return infinite.data;

    return {
      ...infinite.data,
      pages: infinite.data.pages.map(page => ({
        ...page,
        claims: page.claims.map(claim => ({
          ...claim,
          positions: claim.positions.map(position => withRowParticipantAvatars(position, withAvatar)),
        })),
      })),
    };
  }, [infinite.data, withAvatar]);

  return withQueryData(infinite, data);
}

export function useMatchmakingMatches(enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const authenticated = useMatchmakingScope(enabled);

  const query = useQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
    queryKey: debateQueryKeys.matches(accountKey),
    queryFn: ({ signal }) => listMatchmakingMatches(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
  });

  // The Matches tab draws the same `MatchmakingClaimCard` as the Claims tab, off the same
  // `positions[].participants` — so it needs the same treatment. See `participant-avatars`.
  const participants = React.useMemo(
    () =>
      query.data?.matches.flatMap(match => match.positions.flatMap(position => position.participants)) ??
      EMPTY_PARTICIPANTS,
    [query.data]
  );

  const withAvatar = useParticipantAvatars(participants, enabled && authenticated);

  const data = React.useMemo(() => {
    if (!query.data) return query.data;

    return {
      ...query.data,
      matches: query.data.matches.map(match => ({
        ...match,
        positions: match.positions.map(position => withRowParticipantAvatars(position, withAvatar)),
      })),
    };
  }, [query.data, withAvatar]);

  return withQueryData(query, data);
}

/**
 * Incoming + outbound requests. `debate.requests_changed` is account-scoped and needs no
 * subscription, so this stays fresh even when the hub is closed (the coordinator needs it for the
 * incoming-request popup).
 */
export function useDebateRequests(enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
    queryKey: debateQueryKeys.requests(accountKey),
    queryFn: ({ signal }) => listDebateRequests(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
    refetchOnWindowFocus: true,
  });

  // Both parties of every request, resolved in one batch — see `useDebatePeople` for why this is
  // done here rather than in the rows that draw the faces.
  const parties = React.useMemo(() => {
    if (!query.data) return EMPTY_PARTIES;
    const requests = [...(query.data.outbound ? [query.data.outbound] : []), ...query.data.incoming];

    return requests.flatMap(request => [request.requester, request.recipient]);
  }, [query.data]);

  const withAvatar = useParticipantAvatars(parties, enabled && authenticated);

  const data = React.useMemo(() => {
    if (!query.data) return query.data;

    const withParties = (request: DebateRequest): DebateRequest => ({
      ...request,
      requester: withAvatar(request.requester),
      recipient: withAvatar(request.recipient),
    });

    return {
      ...query.data,
      outbound: query.data.outbound ? withParties(query.data.outbound) : query.data.outbound,
      incoming: query.data.incoming.map(withParties),
    };
  }, [query.data, withAvatar]);

  return withQueryData(query, data);
}

export function useDebateBlocks(enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
    queryKey: debateQueryKeys.blocks(accountKey),
    queryFn: ({ signal }) => listDebateBlocks(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
  });
}

export function useCreateDebateRequest() {
  const getContext = useActionContext('debate_matchmaking', 'entity', '');
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const mutation = useMutation({
    mutationFn: (request: CreateDebateRequestBody) => createDebateRequest(request, getPrivyIdentityToken, accountKey),
    onSuccess: () => void invalidateDebatesOutsideRematchClaims(queryClient),
  });
  return useObservedMutation(mutation, 'start_debate', request =>
    getContext({ target_type: 'claim', target_id: request.claim_entity_id })
  );
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
  const getContext = useActionContext('debate_matchmaking', 'entity', '');
  const queryClient = useQueryClient();
  const router = useRouter();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const mutation = useMutation({
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
  return useObservedMutation(mutation, 'join_debate', request =>
    getContext({ target_type: 'debate_request', target_id: request.requestId })
  );
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
