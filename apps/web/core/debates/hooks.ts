'use client';

import { usePrivy } from '@geogenesis/auth';
import { type UseQueryResult, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { getCachedIdentityToken, useIdentityTokenSync } from '~/core/auth/identity-token';

import {
  type Debate,
  type DebateActivity,
  type DebateMediaArtifactUrlRequest,
  type DebateMediaProcessRequest,
  type DebateMediaResponse,
  GeoChatRequestError,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  type TranscriptFormat,
  abortDebate,
  acceptDebateChallenge,
  acceptDebateMatch,
  acceptDebateRematchRequest,
  cancelDebateRecording,
  completeLocalRecordingUpload,
  consentToDebateRematch,
  createDebateChallenge,
  createDebateRematchRequest,
  createLocalRecordingUpload,
  declineDebateMatch,
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
import { useDebateAttention } from './debate-attention';
import { useDebateGatewayScope } from './debate-gateway';
import { hasProcessedVideo } from './playback-utils';

const debateQueryNetworkOptions = {
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
  rematch: (accountKey: string | null, sessionId: string) =>
    ['debates', 'account', accountKey, 'rematch', sessionId] as const,
  rematchClaims: (accountKey: string | null, sessionId: string, claimIds: string[]) =>
    ['debates', 'account', accountKey, 'rematch', sessionId, 'claims', claimIds] as const,
  sharePrompts: (accountKey: string | null) => ['debates', 'account', accountKey, 'share-prompts'] as const,
  profile: (accountKey: string | null, profileSpaceId: string) =>
    ['debates', 'account', accountKey, 'profile', profileSpaceId] as const,
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

// Pass a claim-id array to enrich a known set, or `null` to list every debatable
// claim in the space. geo-chat indexes them, so this skips the KG scan over all
// the space's Claim entities that 504s on large spaces.
export function useDebateClaims(spaceId: string, claimIds: string[] | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const shouldFetch = enabled && (claimIds === null || claimIds.length > 0);
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, authenticated && shouldFetch);

  React.useEffect(
    function refetchReadinessAfterIndexedResponse() {
      if (!shouldFetch) return;

      return queryClient.getQueryCache().subscribe(event => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        const [scope, , responseEntityId, responseSpaceId, , responseKind] = event.query.queryKey;
        if (
          scope !== 'user-entity-response' ||
          responseSpaceId !== spaceId ||
          (responseKind !== 'stance' && responseKind !== 'veracity') ||
          (claimIds !== null && !claimIds.includes(String(responseEntityId)))
        ) {
          return;
        }

        void queryClient.invalidateQueries({ queryKey: ['debates', 'claims', spaceId] });
      });
    },
    [claimIds, queryClient, shouldFetch, spaceId]
  );

  return useQuery({
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
}

export function useJoinDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId }: { claimId: string }) =>
      joinDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
    },
  });
}

export function useLeaveDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId }: { claimId: string }) =>
      leaveDebateQueue(spaceId, claimId, getPrivyIdentityToken, accountKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
    },
  });
}

export function useDebateActivity(enabled = true) {
  const queryClient = useQueryClient();
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
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
    enabled: enabled && authenticated,
  });
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
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
    },
  });
}

function useClearDebateActivityCache({ clearCooldown, reconcile }: { clearCooldown: boolean; reconcile: boolean }) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();

  return React.useCallback(
    (debateId: string) => {
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current => {
        if (!current || current.debate?.id !== debateId) return current;
        return clearCooldown ? { ...current, debate: null, cooldown_until: null } : { ...current, debate: null };
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

export function useAcceptDebateMatch(spaceId?: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ matchId, formatId }: { matchId: string; formatId?: string }) =>
      acceptDebateMatch(matchId, getPrivyIdentityToken, accountKey, formatId),
    onSuccess: result => {
      if (result.debate) {
        queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
      }
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
      if (spaceId) void queryClient.invalidateQueries({ queryKey: debateQueryKeys.spaceDebates(spaceId) });
    },
  });
}

export function useDeclineDebateMatch(spaceId?: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (matchId: string) => declineDebateMatch(matchId, getPrivyIdentityToken, accountKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
      if (spaceId) void queryClient.invalidateQueries({ queryKey: debateQueryKeys.spaceDebates(spaceId) });
    },
  });
}

export function useSpaceDebates(spaceId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, enabled && authenticated);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.spaceDebates(spaceId),
    queryFn: ({ signal }) =>
      listSpaceDebates(
        spaceId,
        authenticated ? getPrivyIdentityToken : undefined,
        authenticated ? accountKey : null,
        signal
      ),
    enabled,
  });
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
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current => ({
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

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.rematch(accountKey, sessionId),
    queryFn: ({ signal }) => getDebateRematch(sessionId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(sessionId),
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

export function useDebateRematchClaims(sessionId: string, claimIds: string[] = [], enabled = true) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  React.useEffect(
    function refetchRematchClaimsAfterIndexedResponse() {
      if (!enabled || !sessionId) return;

      return queryClient.getQueryCache().subscribe(event => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        const [scope, , responseEntityId, , , responseKind] = event.query.queryKey;
        if (
          scope !== 'user-entity-response' ||
          (responseKind !== 'stance' && responseKind !== 'veracity') ||
          (claimIds.length > 0 && !claimIds.includes(String(responseEntityId)))
        ) {
          return;
        }

        void queryClient.invalidateQueries({
          queryKey: ['debates', 'account', accountKey, 'rematch', sessionId, 'claims'],
        });
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
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.rematch(accountKey, result.session.id), result.session);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematch(accountKey, result.session.id) });
      if (result.debate) {
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
      void queryClient.invalidateQueries({
        queryKey: ['debates', 'account', accountKey, 'rematch', result.session.id, 'claims'],
      });
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
