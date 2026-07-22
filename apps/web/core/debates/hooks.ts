'use client';

import { usePrivy } from '@geogenesis/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { getCachedIdentityToken, useIdentityTokenSync } from '~/core/auth/identity-token';

import {
  type DebateActivity,
  type DebateMediaArtifactUrlRequest,
  type DebateMediaProcessRequest,
  type JoinDebateQueueRequest,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  type TranscriptFormat,
  abortDebate,
  acceptDebateMatch,
  acceptDebateRematchRequest,
  cancelDebateRecording,
  completeLocalRecordingUpload,
  consentToDebateRematch,
  createDebateRematchRequest,
  createLocalRecordingUpload,
  declineDebateMatch,
  getDebate,
  getDebateActivity,
  getDebateMedia,
  getDebateMediaArtifactUrl,
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
  rejectDebateRematchRequest,
  requestDebateMediaProcessing,
  updateDebateAvailability,
  updateDebatePreference,
  updateDebateRematchPosition,
} from './api';
import { useDebateGatewayScope } from './debate-gateway';

const debateQueryNetworkOptions = {
  retry: false,
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
} as const;

export const debateQueryKeys = {
  claims: (spaceId: string, claimIds: string[]) => ['debates', 'claims', spaceId, claimIds] as const,
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

export function useDebateClaims(spaceId: string, claimIds: string[], enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, enabled && authenticated && claimIds.length > 0);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.claims(spaceId, claimIds),
    queryFn: ({ signal }) =>
      listDebateClaims(
        spaceId,
        claimIds,
        authenticated ? getPrivyIdentityToken : undefined,
        authenticated ? accountKey : null,
        signal
      ),
    enabled: enabled && claimIds.length > 0,
  });
}

export function useJoinDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId, request }: { claimId: string; request: JoinDebateQueueRequest }) =>
      joinDebateQueue(spaceId, claimId, request, getPrivyIdentityToken, accountKey),
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

export function useUpdateDebatePreference(spaceId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId, position }: { claimId: string; position: boolean }) =>
      updateDebatePreference(spaceId, claimId, { position }, getPrivyIdentityToken, accountKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}

export function useDebateActivity(enabled = true) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.activity(accountKey),
    queryFn: ({ signal }) => getDebateActivity(getPrivyIdentityToken, accountKey, signal),
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

export function useClearTimedOutDebateActivity() {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();

  return React.useCallback(
    (debateId: string) => {
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current => {
        if (!current || current.debate?.id !== debateId) return current;
        return { ...current, debate: null, cooldown_until: null };
      });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
    },
    [accountKey, queryClient]
  );
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
    mutationFn: () => consentToDebateRematch(debateId, getPrivyIdentityToken, accountKey),
    onSuccess: session => {
      queryClient.setQueryData(debateQueryKeys.rematch(accountKey, session.id), session);
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity(accountKey), current => ({
        online: current?.online ?? true,
        available_to_debate: current?.available_to_debate ?? true,
        cooldown_until: null,
        match: null,
        debate: null,
        rematch: session,
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
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematch(accountKey, session.id) });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity(accountKey) });
    },
  });
}

export function useDebateRematchClaims(sessionId: string, claimIds: string[] = [], enabled = true) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.rematchClaims(accountKey, sessionId, claimIds),
    queryFn: ({ signal }) => listDebateRematchClaims(sessionId, claimIds, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(sessionId),
  });
}

export function useUpdateDebateRematchPosition(sessionId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId, position, sourceSpaceId }: { claimId: string; position: boolean; sourceSpaceId: string }) =>
      updateDebateRematchPosition(sessionId, claimId, position, sourceSpaceId, getPrivyIdentityToken, accountKey),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['debates', 'account', accountKey, 'rematch', sessionId, 'claims'],
      }),
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
