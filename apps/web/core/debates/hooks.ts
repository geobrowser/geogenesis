'use client';

import { usePrivy } from '@geogenesis/auth';
import {
  type QueryClient,
  type UseQueryResult,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import * as React from 'react';

import { getCachedIdentityToken, useIdentityTokenSync } from '~/core/auth/identity-token';

import {
  type Debate,
  type DebateActivity,
  type DebateClaimsResponse,
  type DebateMediaArtifactUrlRequest,
  type DebateMediaProcessRequest,
  type DebateMediaResponse,
  type DebateRematchClaimsResponse,
  GeoChatRequestError,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  type MatchmakingClaimsQuery,
  type TranscriptFormat,
  abortDebate,
  acceptDebateChallenge,
  acceptDebateRematchRequest,
  cancelDebateRecording,
  completeLocalRecordingUpload,
  consentToDebateRematch,
  createDebateChallenge,
  createDebateRematchRequest,
  createLocalRecordingUpload,
  endDebateTurn,
  getDebate,
  getDebateActivity,
  getDebateMedia,
  getDebateMediaArtifactUrl,
  getDebateProfile,
  getDebateRematch,
  getDebateTranscript,
  getLiveKitToken,
  getRecordingUrl,
  getRematchLiveKitToken,
  handleDebateSharePrompt,
  joinDebateQueue,
  leaveDebateQueue,
  leaveDebateRematch,
  listDebateClaims,
  listDebateRematchClaims,
  listDebateSharePrompts,
  listSpaceDebates,
  markDebateJoined,
  markDebateReady,
  rejectDebateChallenge,
  rejectDebateRematchRequest,
  requestDebateMediaProcessing,
  retryDebatePhaseBoundaryRequest,
  updateDebateAvailability,
} from './api';
import { claimResponseIndexedEvent } from './claim-response-indexed-notifier';
import { useDebateAttention, useDebatePresence } from './debate-attention';
import { markEnteringDebate, markEnteringPendingDebate } from './debate-entry-intent';
import { useDebateGatewayScope, useDebateGatewaySnapshot, useDebateGatewaySpaceScopes } from './debate-gateway';
import { hasProcessedVideo } from './playback-utils';
import {
  isRematchClaimsQueryKey,
  refreshRematchClaimBatches,
  rematchClaimBatchesWithClaim,
} from './rematch-claims-query-key';
import { type SpaceDebateSupport, useSpaceDebateSupport } from './space-debate-support';

export const debateQueryNetworkOptions = {
  retry: false,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
} as const;

export const debateQueryKeys = {
  claims: (spaceId: string, claimIds: string[] | null) => ['debates', 'claims', spaceId, claimIds ?? 'all'] as const,
  spaceDebates: (spaceId: string) => ['debates', 'space', spaceId] as const,
  debate: (debateId: string) => ['debates', 'detail', debateId] as const,
  media: (debateId: string) => ['debates', 'media', debateId] as const,
  transcript: (debateId: string, format: TranscriptFormat) => ['debates', 'transcript', debateId, format] as const,
  activity: (accountKey: string | null) => ['debates', 'account', accountKey, 'activity'] as const,
  rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  rematch: (accountKey: string | null, sessionId: string) =>
    ['debates', 'account', accountKey, 'rematch', sessionId] as const,
  // Deliberately NOT nested under `rematch(...)`: the gateway invalidates that prefix on every
  // `debate.rematch_changed`, and refetching here would hand `<LiveKitRoom>` a new token and tear
  // down the live voice connection.
  rematchLiveKit: (accountKey: string | null, sessionId: string) =>
    ['debates', 'account', accountKey, 'rematch-livekit', sessionId] as const,
  rematchClaims: (accountKey: string | null, sessionId: string, claimIds: string[]) =>
    ['debates', 'account', accountKey, 'rematch', sessionId, 'claims', claimIds] as const,
  sharePrompts: (accountKey: string | null) => ['debates', 'account', accountKey, 'share-prompts'] as const,
  profile: (accountKey: string | null, profileSpaceId: string) =>
    ['debates', 'account', accountKey, 'profile', profileSpaceId] as const,
  people: (accountKey: string | null) => ['debates', 'account', accountKey, 'people'] as const,
  /** Prefix covering every filter combination of the claims list. */
  matchmakingClaimsRoot: (accountKey: string | null) =>
    ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
  matchmakingClaims: (accountKey: string | null, filters: MatchmakingClaimsQuery) =>
    ['debates', 'account', accountKey, 'matchmaking-claims', filters] as const,
  matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
  requests: (accountKey: string | null) => ['debates', 'account', accountKey, 'requests'] as const,
  blocks: (accountKey: string | null) => ['debates', 'account', accountKey, 'blocks'] as const,
};

export function useGeoChatAuth() {
  const privy = usePrivy();
  useIdentityTokenSync();

  return {
    ready: privy.ready,
    authenticated: privy.authenticated,
    accountKey: privy.user?.id ?? null,
    getPrivyIdentityToken: getCachedIdentityToken,
  };
}

/**
 * Holds a query's own result open while the space type is still resolving.
 *
 * The gate can't just disable the query and leave it at that: a disabled react-query reports
 * `isLoading: false` with no data, so consumers read the wait as a settled empty answer. See
 * {@link SpaceDebateSupport}.
 */
function holdWhileSpaceResolves<T extends { isLoading: boolean }>(query: T, support: SpaceDebateSupport): T {
  return support === 'unknown' ? { ...query, isLoading: true } : query;
}

// Pass a claim-id array to enrich a known set, or `null` to list every debatable
// claim in the space. geo-chat indexes them, so this skips the KG scan over all
// the space's Claim entities that 504s on large spaces.
export function useDebateClaims(spaceId: string, claimIds: string[] | null, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const support = useSpaceDebateSupport(spaceId);
  const shouldFetch = enabled && support === 'indexed' && (claimIds === null || claimIds.length > 0);
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, authenticated && shouldFetch);

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.claims(spaceId, claimIds),
    queryFn: ({ signal }) =>
      listDebateClaims(
        spaceId,
        claimIds ?? [],
        authenticated ? getPrivyIdentityToken : undefined,
        authenticated ? accountKey : null,
        signal
      ),
    enabled: shouldFetch,
  });

  return holdWhileSpaceResolves(query, support);
}

/**
 * The same per-space payload as {@link useDebateClaims}, for callers holding claims spread across
 * several spaces — the rematch picker mixes geo-chat's session claims with published ones from
 * anywhere. A hook per space is impossible when the list changes length, so this fans out.
 *
 * `claims` comes back in no particular order: batches are keyed by sorted id so their query keys
 * survive the caller reordering or prepending ids. Key the result by `claim_entity_id`.
 */
export function useDebateClaimsBySpaces(groups: Array<{ spaceId: string; claimIds: string[] }>) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  // Deliberately ungated on space type, unlike the single-space {@link useDebateClaims}. The
  // rematch picker filters its claims by `isSpaceDebatePublishable` before they reach here, and it
  // holds scopes on both participants' personal spaces on purpose — a debater's own claims live
  // there, and the opponent's *first* position is exactly the case with no claim to derive the
  // scope from yet. Narrowing this to indexed spaces would strip those, and since a scope-level
  // rejection now recycles the socket rather than parking it (GEO-2650), there is nothing left for
  // the narrowing to save.
  //
  // Same subscription `useDebateClaims` makes for its one space: without it the gateway never
  // delivers this space's claim changes, so nothing here would refresh when someone responds.
  const spaceIds = React.useMemo(() => groups.map(group => group.spaceId), [groups]);
  useDebateGatewaySpaceScopes(spaceIds, authenticated && spaceIds.length > 0);

  // Stable by contract: react-query re-runs `combine` whenever its identity changes and diffs the
  // result with `replaceEqualDeep`, so a fresh closure each render would defeat callers' memos.
  //
  // Status rides along with the claims deliberately. Flattening to a bare list makes a pending or
  // failed lookup indistinguishable from "no readiness on this claim", and callers rendering a
  // readiness switch would then draw it off — misreporting a claim the viewer is standing ready on
  // for as long as the failure lasts.
  const combine = React.useCallback(
    (results: UseQueryResult<DebateClaimsResponse>[]) => ({
      claims: results.flatMap(result => result.data?.claims ?? []),
      isLoading: results.some(result => result.isLoading),
      isError: results.some(result => result.isError),
    }),
    []
  );

  const batches = React.useMemo(
    () =>
      groups.flatMap(group =>
        stableClaimIdChunks(group.claimIds).map(claimIds => ({ spaceId: group.spaceId, claimIds }))
      ),
    [groups]
  );

  return useQueries({
    queries: batches.map(group => ({
      ...debateQueryNetworkOptions,
      queryKey: debateQueryKeys.claims(group.spaceId, group.claimIds),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        listDebateClaims(
          group.spaceId,
          group.claimIds,
          authenticated ? getPrivyIdentityToken : undefined,
          authenticated ? accountKey : null,
          signal
        ),
      enabled: authenticated && group.claimIds.length > 0,
    })),
    combine,
  });
}

/** Maximum number of ids accepted by geo-chat's per-space debate-claims endpoint. */
export const DEBATE_CLAIM_ID_BATCH_SIZE = 50;

/**
 * Smallest chunk a content-defined boundary may close, and how often such a boundary occurs. Chosen
 * so the average chunk lands just under {@link DEBATE_CLAIM_ID_BATCH_SIZE} — batching stays about as
 * dense as fixed-size slicing while boundaries remain content-defined.
 */
const DEBATE_CLAIM_ID_MIN_CHUNK = 32;
const DEBATE_CLAIM_ID_BOUNDARY_DIVISOR = 16;

/**
 * Splits ids into query batches whose boundaries come from the ids themselves rather than from their
 * position in the list.
 *
 * Fixed-size slicing makes every chunk after an insertion point change, and each chunk *is* a query
 * key — so one claim arriving at the head of the list re-fetches the entire space and flips every
 * readiness switch on screen back to unresolved. The rematch picker rebuilds this list on every page
 * and filter change, so that is the ordinary case. Sorting alone would only fix reordering of an
 * unchanged set; deriving the cut points from the ids makes an insertion rebuild the chunk it lands
 * in and then resynchronise at the next boundary, leaving the rest of the space cached.
 */
function stableClaimIdChunks(claimIds: string[], batchSize = DEBATE_CLAIM_ID_BATCH_SIZE) {
  const uniqueClaimIds = [...new Set(claimIds)].sort();
  const chunks: string[][] = [];
  let current: string[] = [];
  // Scale the boundary rule with the cap so the average chunk stays just under it.
  const minChunk = Math.max(1, Math.round((batchSize * DEBATE_CLAIM_ID_MIN_CHUNK) / DEBATE_CLAIM_ID_BATCH_SIZE));
  const boundaryDivisor = Math.max(
    1,
    Math.round((batchSize * DEBATE_CLAIM_ID_BOUNDARY_DIVISOR) / DEBATE_CLAIM_ID_BATCH_SIZE)
  );

  for (const claimId of uniqueClaimIds) {
    current.push(claimId);
    const atContentBoundary = current.length >= minChunk && claimIdHash(claimId) % boundaryDivisor === 0;
    if (atContentBoundary || current.length >= batchSize) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

/** FNV-1a. Only needs to spread ids evenly across boundary buckets, so 32 bits is plenty. */
function claimIdHash(claimId: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < claimId.length; index += 1) {
    hash ^= claimId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Everything under `'debates'` except the rematch claim batches. The root-wide invalidation a
 * mutation used to fire refetched every batch the picker had loaded — a request per page on
 * screen — for a change that touched none of them.
 */
export function invalidateDebatesOutsideRematchClaims(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: query => query.queryKey[0] === 'debates' && !isRematchClaimsQueryKey(query.queryKey),
  });
}

/**
 * Standing ready (or down) on one claim moves that claim's readiness wherever it is listed and
 * re-sorts who is matchable. Nothing else under `'debates'` changes, so only those families go.
 */
function invalidateAfterReadinessChange(queryClient: QueryClient, accountKey: string | null, claimId: string) {
  for (const queryKey of [
    ['debates', 'claims'] as const,
    debateQueryKeys.matchmakingClaimsRoot(accountKey),
    debateQueryKeys.matches(accountKey),
    debateQueryKeys.activity(accountKey),
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
  void refreshRematchClaimBatches(queryClient, rematchClaimBatchesWithClaim(accountKey, claimId));
}

export function useJoinDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId }: { claimId: string }) =>
      joinDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey),
    onSuccess: (_result, { claimId }) => invalidateAfterReadinessChange(queryClient, accountKey, claimId),
  });
}

export function useLeaveDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId }: { claimId: string }) =>
      leaveDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey),
    onSuccess: (_result, { claimId }) => invalidateAfterReadinessChange(queryClient, accountKey, claimId),
  });
}

/**
 * How often the rematch session re-asks while its picker is on screen (GEO-2650).
 *
 * A backstop, not the delivery mechanism. `debate.rematch_changed` still arrives by push and is
 * what normally updates this — measured at 1.28s average and 2.27s worst from emit to Kafka
 * publish, across every rematch event in the last week.
 *
 * It exists because this query had no fallback at all, and the push has one failure mode with a
 * 30-second budget: a socket that dies silently is not noticed until the next heartbeat
 * (`DEFAULT_HEARTBEAT_INTERVAL_MS` in `debate-gateway`), and only then reconnects and refetches.
 * Preston measured a request taking ~36 seconds to reach an opponent, which is that window plus a
 * reconnect and handshake — and every other link in the chain measures well under it.
 *
 * Five seconds because both people are sitting there waiting for each other: this is the one flow
 * where a stale list is the whole problem rather than a cosmetic lag. It only runs while the picker
 * is foregrounded, so an idle tab still costs nothing.
 */
const REMATCH_POLL_MS = 5_000;

/** How often activity re-asks while this tab is on screen, with a live gateway behind it. */
const ACTIVITY_POLL_MS = 30_000;
/** And while the gateway is paused, when this is the only thing still asking. */
const ACTIVITY_DEGRADED_POLL_MS = 10_000;

/**
 * The viewer's own debate state: the debate or rematch they are in, and the counts that gate the
 * incoming-request popup.
 *
 * This is the entry point for anything that arrives unannounced. `DebateCoordinator` only fetches
 * the request list once `incoming_request_count` says one exists, so a stale answer here is a
 * request the recipient is never shown — and every other route to freshness is switched off:
 * `debateQueryNetworkOptions` turns off `refetchOnWindowFocus` and `refetchOnReconnect`, which
 * leaves the gateway's `debate.requests_changed` as the only thing that ever re-asked.
 *
 * That is fine until the socket is not listening, and it has two ways not to be. A dropped
 * connection backs off for up to thirty seconds before `READY` triggers its reconcile. And an
 * `ERROR` frame the gateway can't act on pauses live updates deliberately, without scheduling a
 * reconnect — a scope-level rejection, but it takes the account-level stream down with it, and
 * nothing recovers it. Either way the popup waited on a remount, which is how a request took
 * "30-60 seconds" to appear (GEO-2638).
 *
 * So: poll while this tab is on screen, faster while the gateway is paused and this is the only
 * thing still asking, and re-ask on return to the tab. The socket still does the fast path — a
 * couple of seconds, of which the outbox relay is two — and this only bounds the bad case.
 *
 * The gate is *presence*, not attention. Attention additionally requires `document.hasFocus()`,
 * and gating the poll on that meant a tab sitting open on screen — but behind the window the
 * viewer happened to be typing in — did not poll at all, leaving the socket as the only delivery
 * path for the exact case this poll exists to cover. An incoming request is by definition the
 * thing that arrives while you are looking at something else, so focus is the wrong question to
 * ask; that is why geo-chat keys reachability (`is_online`) on presence too. This is what was
 * still reported as a ~36 second delivery after GEO-2638 (GEO-2650).
 */
export function useDebateActivity(enabled = true) {
  const queryClient = useQueryClient();
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const attentive = useDebateAttention();
  const present = useDebatePresence();
  const { paused } = useDebateGatewaySnapshot();
  const queryEnabled = enabled && authenticated;
  const wasPresent = React.useRef(present);
  const wasAttentive = React.useRef(attentive);

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.activity(accountKey),
    queryFn: async ({ signal }) => {
      const activity = await getDebateActivity(getPrivyIdentityToken, accountKey, signal);
      if (activity.debate) {
        queryClient.setQueryData(debateQueryKeys.debate(activity.debate.id), activity.debate);
      }
      if (activity.rematch) {
        queryClient.setQueryData(debateQueryKeys.rematch(accountKey, activity.rematch.id), activity.rematch);
      }
      return activity;
    },
    enabled: queryEnabled,
    // Hidden tabs still don't poll: they have no popup to draw, and browsers throttle their timers
    // anyway. On-screen is the bar, whether or not this is the frontmost window.
    refetchInterval: present ? (paused ? ACTIVITY_DEGRADED_POLL_MS : ACTIVITY_POLL_MS) : false,
  });

  // Coming back is the one moment a viewer expects to be shown what they missed, and the shared
  // options switch off React Query's own focus refetch for every debate query. Both transitions
  // count: becoming visible restarts the poll but not immediately, and regaining focus is when
  // someone is most likely to be waiting on a popup.
  React.useEffect(() => {
    const returned = (present && !wasPresent.current) || (attentive && !wasAttentive.current);
    wasPresent.current = present;
    wasAttentive.current = attentive;
    if (returned && queryEnabled) void query.refetch();
  }, [attentive, present, query.refetch, queryEnabled]);

  return query;
}

export function useUpdateDebateAvailability() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const activityKey = debateQueryKeys.activity(accountKey);

  return useMutation({
    mutationFn: (availableToDebate: boolean) =>
      updateDebateAvailability(availableToDebate, getPrivyIdentityToken, accountKey),
    onMutate: async availableToDebate => {
      await queryClient.cancelQueries({ queryKey: activityKey });
      const previous = queryClient.getQueryData<DebateActivity>(activityKey);
      queryClient.setQueryData<DebateActivity>(activityKey, current =>
        current ? { ...current, available_to_debate: availableToDebate } : current
      );
      return { previous };
    },
    onError: (_error, _availableToDebate, context) => {
      queryClient.setQueryData(activityKey, context?.previous);
    },
    onSuccess: activity => {
      queryClient.setQueryData(activityKey, activity);
    },
    onSettled: () => {
      void invalidateDebatesOutsideRematchClaims(queryClient);
    },
  });
}

function useClearDebateActivityCache({ clearCooldown, reconcile }: { clearCooldown: boolean; reconcile: boolean }) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();

  return React.useCallback(
    (debateId: string) => {
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current => {
        if (!current) return current;
        const clearsDebate = current.debate?.id === debateId;
        // The rematch anchored to this debate goes with it. DebateCoordinator navigates into
        // `source_debate_id` for as long as a session is deciding, so leaving the room while the
        // session sat in activity sent the viewer straight back into the room they just left.
        const clearsRematch = current.rematch?.source_debate_id === debateId;
        if (!clearsDebate && !clearsRematch) return current;
        return {
          ...current,
          ...(clearsDebate ? { debate: null } : null),
          ...(clearsDebate && clearCooldown ? { cooldown_until: null } : null),
          ...(clearsRematch ? { rematch: null } : null),
        };
      });
      if (reconcile) {
        void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
      }
    },
    [accountKey, clearCooldown, queryClient, reconcile]
  );
}

export function useClearTimedOutDebateActivity() {
  return useClearDebateActivityCache({ clearCooldown: true, reconcile: true });
}

export function useClearDebateActivity() {
  return useClearDebateActivityCache({ clearCooldown: false, reconcile: false });
}

export function useSpaceDebates(spaceId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  // The browse feed subscribes the same way `useDebateClaims` does, so it needs the same gate:
  // opening the debate feed on a personal space raised the banner on its own.
  const support = useSpaceDebateSupport(spaceId);
  const shouldFetch = enabled && support === 'indexed';
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, shouldFetch && authenticated);

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.spaceDebates(spaceId),
    queryFn: ({ signal }) =>
      listSpaceDebates(
        spaceId,
        authenticated ? getPrivyIdentityToken : undefined,
        authenticated ? accountKey : null,
        signal
      ),
    enabled: shouldFetch,
  });

  return holdWhileSpaceResolves(query, support);
}

export function useDebate(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  useDebateGatewayScope({ scope: 'debate', debate_id: debateId }, enabled && authenticated);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.debate(debateId),
    queryFn: ({ signal }) =>
      getDebate(debateId, authenticated ? getPrivyIdentityToken : undefined, authenticated ? accountKey : null, signal),
    enabled,
  });
}

export function useLiveKitJoin(debateId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => getLiveKitToken(debateId, getPrivyIdentityToken, accountKey),
  });
}

export function useMarkDebateJoined(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => markDebateJoined(debateId, getPrivyIdentityToken, accountKey),
    onSuccess: debate => {
      queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(debate.id) });
    },
  });
}

export function useMarkDebateReady(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => markDebateReady(debateId, getPrivyIdentityToken, accountKey),
    onSuccess: debate => {
      queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(debate.id) });
    },
  });
}

export function useEndDebateTurn(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ turnIndex, endedAtMs }: { turnIndex: number; endedAtMs: number }) =>
      endDebateTurn(debateId, turnIndex, endedAtMs, getPrivyIdentityToken, accountKey),
    retry: (failureCount, error) =>
      failureCount < 2 &&
      (!(error instanceof GeoChatRequestError) || error.status === 408 || error.status === 429 || error.status >= 500),
    onSuccess: debate => {
      queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(debate.id) });
    },
  });
}

export function useAbortDebate(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => abortDebate(debateId, getPrivyIdentityToken, accountKey),
    onSuccess: debate => {
      queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(debate.id) });
    },
  });
}

export function useCancelDebateRecording(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => cancelDebateRecording(debateId, getPrivyIdentityToken, accountKey),
    onSuccess: debate => {
      queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(debate.id) });
    },
  });
}

export function useConsentToDebateRematch(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () =>
      retryDebatePhaseBoundaryRequest(() => consentToDebateRematch(debateId, getPrivyIdentityToken, accountKey)),
    onSuccess: session => {
      queryClient.setQueryData(debateQueryKeys.rematch(accountKey, session.id), session);
      queryClient.setQueryData<Debate>(debateQueryKeys.debate(debateId), current =>
        current ? { ...current, rematch_session_id: session.id } : current
      );
      // Spread what is already there: rebuilding the object from scratch dropped
      // `incoming_request_count` and `outbound_request`, which zeroed the navbar badge and stopped
      // the coordinator fetching requests until the invalidation below landed.
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current => ({
        ...current,
        online: current?.online ?? true,
        available_to_debate: current?.available_to_debate ?? true,
        cooldown_until: null,
        match: null,
        debate: null,
        rematch: session,
        challenge: null,
      }));
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematch(accountKey, session.id) });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(debateId) });
    },
  });
}

export function useDebateRematch(sessionId: string, enabled = true) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  // Presence, not attention. `useDebateAttention` also requires `document.hasFocus()`, so a tab
  // sitting open on screen behind whatever window the viewer is typing in would not poll — and
  // waiting for an opponent while looking elsewhere is exactly this flow. That distinction is the
  // one GEO-2650 already cost once on the activity poll; see the note on `useDebateActivity`.
  const present = useDebatePresence();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.rematch(accountKey, sessionId),
    queryFn: ({ signal }) => getDebateRematch(sessionId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(sessionId),
    // See REMATCH_POLL_MS. The push still does the work; this bounds the case where it never
    // arrives, which this query previously had no answer to.
    refetchInterval: present ? REMATCH_POLL_MS : false,
  });
}

/**
 * Mints the LiveKit token for the rematch voice channel. A query rather than a mutation because
 * voice auto-joins with the picker — there is no user gesture to hang a mutation on.
 *
 * The token is minted once per mount and held forever (`staleTime: Infinity`): handing
 * `<LiveKitRoom>` a fresh token mid-session tears the connection down. Recovery from a dead
 * connection goes through invalidating this key and remounting the room instead.
 */
export function useRematchLiveKitJoin(sessionId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.rematchLiveKit(accountKey, sessionId),
    queryFn: () => getRematchLiveKitToken(sessionId, getPrivyIdentityToken, accountKey),
    enabled: enabled && authenticated && Boolean(sessionId),
    staleTime: Infinity,
    // Fresh token on re-entry: a cached one may be near expiry or minted for a session state
    // that has since changed.
    gcTime: 0,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error instanceof GeoChatRequestError && [400, 403, 404, 503].includes(error.status)) return false;
      return failureCount < 2;
    },
  });
}

export function useLeaveDebateRematch(sessionId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => leaveDebateRematch(sessionId, getPrivyIdentityToken, accountKey),
    onSuccess: session => {
      queryClient.setQueryData(debateQueryKeys.rematch(accountKey, session.id), session);
      const activityKey = debateQueryKeys.activity(accountKey);
      const activity = queryClient.getQueryData<DebateActivity>(activityKey);
      if (activity) {
        const debate = activity.debate?.id === session.source_debate_id ? null : activity.debate;
        const rematch = activity.rematch?.id === session.id ? null : activity.rematch;
        if (debate !== activity.debate || rematch !== activity.rematch) {
          queryClient.setQueryData(activityKey, { ...activity, debate, rematch });
        }
      }
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematch(accountKey, session.id) });
      void queryClient.invalidateQueries({ queryKey: activityKey });
    },
  });
}

/**
 * geo-chat rejects a request naming more than this many claims outright, so a caller browsing more
 * claims than this has to ask in batches rather than in one request that 400s.
 */
export const REMATCH_CLAIM_ID_BATCH_SIZE = 100;

/**
 * {@link useDebateRematchClaims} for a list of ids of any length, split across as many requests as
 * the server's per-request cap needs. The rematch picker accumulates claims a page at a time and
 * adds curated ones on top, so it passes the cap in ordinary use — and losing the whole response
 * to a 400 takes every claim's positions with it, not just the ones past the limit.
 */
export function useDebateRematchClaimsForIds(sessionId: string, claimIds: string[], enabled = true) {
  // Content-defined chunks for the same reason as `useDebateClaimsBySpaces`: callers rebuild this
  // list as they filter, and index-sliced batches would all change key on every insertion.
  const batches = React.useMemo(() => stableClaimIdChunks(claimIds, REMATCH_CLAIM_ID_BATCH_SIZE), [claimIds]);
  return useDebateRematchClaimBatches(sessionId, batches, enabled);
}

function useDebateRematchClaimBatches(sessionId: string, batches: string[][], enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  // Stable by contract, as in `useDebateClaimsBySpaces`.
  const combine = React.useCallback(
    (results: UseQueryResult<DebateRematchClaimsResponse>[]) => ({
      data: {
        claims: results.flatMap(result => result.data?.claims ?? []),
        excluded_claim_ids: [...new Set(results.flatMap(result => result.data?.excluded_claim_ids ?? []))],
      },
      isLoading: results.some(result => result.isLoading),
      error: results.find(result => result.error)?.error ?? null,
    }),
    []
  );

  return useQueries({
    queries: batches.map(batch => ({
      ...debateQueryNetworkOptions,
      queryKey: debateQueryKeys.rematchClaims(accountKey, sessionId, batch),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        listDebateRematchClaims(sessionId, batch, getPrivyIdentityToken, accountKey, signal),
      enabled: enabled && Boolean(sessionId),
    })),
    combine,
  });
}

const NO_CLAIM_IDS: string[] = [];

export function useDebateRematchClaims(sessionId: string, claimIds: string[] = NO_CLAIM_IDS, enabled = true) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  React.useEffect(
    function refetchRematchClaimsAfterIndexedResponse() {
      if (!enabled || !sessionId) return;

      return queryClient.getQueryCache().subscribe(event => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        const response = claimResponseIndexedEvent(event.query.queryKey, event.query.state.data);
        if (!response || (claimIds.length > 0 && !claimIds.includes(response.entityId))) {
          return;
        }

        // Only the batches that name the claim, plus the session's own list. Refetching every
        // batch the picker holds — one per page on screen — for a single response is what left
        // the positions trailing on a long list.
        void refreshRematchClaimBatches(
          queryClient,
          rematchClaimBatchesWithClaim(accountKey, response.entityId, sessionId)
        );
      });
    },
    [accountKey, claimIds, enabled, queryClient, sessionId]
  );

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.rematchClaims(accountKey, sessionId, claimIds),
    queryFn: ({ signal }) => listDebateRematchClaims(sessionId, claimIds, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(sessionId),
  });
}

export function useCreateDebateRematchRequest(sessionId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: { source_space_id: string; claim_id: string; format_id: string }) =>
      createDebateRematchRequest(sessionId, request, getPrivyIdentityToken, accountKey),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.rematch(accountKey, sessionId), result.session);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematch(accountKey, sessionId) });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
    },
  });
}

export function useAcceptDebateRematchRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (requestId: string) => acceptDebateRematchRequest(requestId, getPrivyIdentityToken, accountKey),
    // Same window as the hub's accept: the debate is created inside this round trip and announced to
    // this tab over its own socket, so the id-keyed intent below is taken too late to stop the
    // coordinator prompting us to join it (GEO-2604).
    onMutate: () => ({ releaseEntry: markEnteringPendingDebate() }),
    onSettled: (_result, _error, _variables, context) => context?.releaseEntry(),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.rematch(accountKey, result.session.id), result.session);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematch(accountKey, result.session.id) });
      if (result.debate) {
        // The converted session routes from the rematch picker on its next render. Activity can
        // refetch first and would otherwise make the app-wide coordinator prompt this accepting tab
        // to join the same debate it is already walking into.
        markEnteringDebate(result.debate.id);
        queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
        void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(result.debate.id) });
      }
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
    },
  });
}

export function useRejectDebateRematchRequest() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (requestId: string) => rejectDebateRematchRequest(requestId, getPrivyIdentityToken, accountKey),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.rematch(accountKey, result.session.id), result.session);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematch(accountKey, result.session.id) });
      // A rejection marks one claim `recently_rejected`; only the batches carrying it need to hear.
      const rejectedClaimId = result.request?.claim.claim_entity_id;
      void refreshRematchClaimBatches(
        queryClient,
        rejectedClaimId
          ? rematchClaimBatchesWithClaim(accountKey, rejectedClaimId, result.session.id)
          : { queryKey: ['debates', 'account', accountKey, 'rematch', result.session.id, 'claims'] }
      );
    },
  });
}

export function useDebateProfile(profileSpaceId: string, enabled = true) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const foreground = useDebateAttention();
  const queryEnabled = enabled && authenticated && Boolean(profileSpaceId);
  const wasForeground = React.useRef(foreground);

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.profile(accountKey, profileSpaceId),
    queryFn: ({ signal }) => getDebateProfile(profileSpaceId, getPrivyIdentityToken, accountKey, signal),
    enabled: queryEnabled,
    refetchInterval: foreground ? 30_000 : false,
  });

  React.useEffect(() => {
    const returnedToForeground = foreground && !wasForeground.current;
    wasForeground.current = foreground;
    if (returnedToForeground && queryEnabled) void query.refetch();
  }, [foreground, query.refetch, queryEnabled]);

  return query;
}

export function useCreateDebateChallenge() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: { recipient_profile_space_id: string }) =>
      createDebateChallenge(request, getPrivyIdentityToken, accountKey),
    onSuccess: challenge => {
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current =>
        current ? { ...current, challenge } : current
      );
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
    },
    onError: (error, request) => {
      if (!(error instanceof GeoChatRequestError) || error.code !== 'challenge_unavailable') return;
      void queryClient.invalidateQueries({
        queryKey: debateQueryKeys.profile(accountKey, request.recipient_profile_space_id),
      });
    },
  });
}

export function useAcceptDebateChallenge() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (challengeId: string) => acceptDebateChallenge(challengeId, getPrivyIdentityToken, accountKey),
    onSuccess: result => {
      if (result.session) {
        queryClient.setQueryData(debateQueryKeys.rematch(accountKey, result.session.id), result.session);
      }
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
    },
  });
}

export function useRejectDebateChallenge() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (challengeId: string) => rejectDebateChallenge(challengeId, getPrivyIdentityToken, accountKey),
    onSuccess: () => {
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current =>
        current ? { ...current, challenge: null } : current
      );
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
    },
  });
}

export function useDebateSharePrompts(enabled = true) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.sharePrompts(accountKey),
    queryFn: ({ signal }) => listDebateSharePrompts(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
  });
}

export function useHandleDebateSharePrompt() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ promptId, action }: { promptId: string; action: 'shared' | 'dismissed' }) =>
      handleDebateSharePrompt(promptId, action, getPrivyIdentityToken, accountKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: debateQueryKeys.sharePrompts(accountKey) }),
  });
}

export function useCreateLocalRecordingUpload(debateId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: LocalRecordingUploadRequest) =>
      createLocalRecordingUpload(debateId, request, getPrivyIdentityToken, accountKey),
  });
}

export function useCompleteLocalRecordingUpload(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: LocalRecordingCompleteRequest) =>
      completeLocalRecordingUpload(debateId, request, getPrivyIdentityToken, accountKey),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(result.debate.id) });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.media(result.debate.id) });
    },
  });
}

export function useRecordingUrl() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ debateId, filename }: { debateId: string; filename: string }) =>
      getRecordingUrl(debateId, filename, getPrivyIdentityToken, accountKey),
  });
}

export function useDebateMedia(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  useDebateGatewayScope({ scope: 'debate', debate_id: debateId }, enabled && authenticated);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.media(debateId),
    queryFn: ({ signal }) =>
      getDebateMedia(
        debateId,
        authenticated ? getPrivyIdentityToken : undefined,
        authenticated ? accountKey : null,
        signal
      ),
    enabled,
  });
}

/**
 * Which of the given debates have a processed `final_video`. The space debates endpoint carries
 * recordings but no media artifacts, so readiness can only be answered one debate at a time — pass
 * only already-watchable debates to bound the fan-out. Shares `debateQueryKeys.media` with the
 * player's own lookup, and opens no gateway scope since it's a one-shot check.
 */
export function useProcessedVideoDebateIds(debateIds: string[], enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  // `combine` has to be stable: react-query re-runs it whenever its identity changes, and the
  // result is diffed with `replaceEqualDeep`, which compares arrays structurally but treats every
  // new Set as changed. An inline closure returning a Set therefore hands callers a fresh object
  // each render and defeats their `useMemo`s — hence the callback, and ids as an array.
  const combine = React.useCallback(
    (results: UseQueryResult<DebateMediaResponse>[]) => ({
      processedIds: debateIds.filter((_, index) => hasProcessedVideo(results[index]?.data)),
      isLoading: enabled && results.some(result => result.isPending),
      // A failed lookup is "unknown", not "not ready". It still withholds the debate — nothing
      // should render that can't play — but callers need to tell the two apart, or a geo-chat blip
      // reads to the viewer as "this space has no debates".
      hasError: results.some(result => result.isError),
    }),
    [debateIds, enabled]
  );

  return useQueries({
    queries: debateIds.map(debateId => ({
      ...debateQueryNetworkOptions,
      queryKey: debateQueryKeys.media(debateId),
      // Readiness only moves when the media worker finishes, so don't re-ask on every remount of
      // the feed — that's one request per candidate, up to the list endpoint's 50.
      staleTime: 30_000,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        getDebateMedia(
          debateId,
          authenticated ? getPrivyIdentityToken : undefined,
          authenticated ? accountKey : null,
          signal
        ),
      enabled,
    })),
    combine,
  });
}

export function useRequestDebateMediaProcessing(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request?: DebateMediaProcessRequest) =>
      requestDebateMediaProcessing(debateId, getPrivyIdentityToken, accountKey, request),
    onSuccess: media => {
      queryClient.setQueryData(debateQueryKeys.media(debateId), media);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.media(debateId) });
    },
  });
}

export function useDebateMediaArtifactUrl() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ debateId, request }: { debateId: string; request: DebateMediaArtifactUrlRequest }) =>
      getDebateMediaArtifactUrl(debateId, request, getPrivyIdentityToken, accountKey),
  });
}

export function useDebateTranscript(debateId: string, format: TranscriptFormat = 'json', enabled = true) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  useDebateGatewayScope({ scope: 'debate', debate_id: debateId }, enabled && authenticated);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.transcript(debateId, format),
    queryFn: ({ signal }) =>
      getDebateTranscript(
        debateId,
        format,
        authenticated ? getPrivyIdentityToken : undefined,
        authenticated ? accountKey : null,
        signal
      ),
    enabled,
  });
}
