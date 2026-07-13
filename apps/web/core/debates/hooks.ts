'use client';

import { getIdentityToken, usePrivy } from '@geogenesis/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateActivity,
  type DebateMediaArtifactUrlRequest,
  type DebateMediaProcessRequest,
  type GetPrivyIdentityToken,
  type JoinDebateQueueRequest,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  type TranscriptFormat,
  abortDebate,
  acceptDebateMatch,
  acceptDebateRematchRequest,
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
  heartbeatDebatePresence,
  joinDebateQueue,
  leaveDebateRematch,
  listDebateClaims,
  listDebateRematchClaims,
  listDebateSharePrompts,
  listSpaceDebates,
  markDebateJoined,
  markDebateReady,
  rejectDebateRematchRequest,
  requestDebateMediaProcessing,
  updateDebatePreference,
  updateDebateRematchPosition,
} from './api';

export const debateQueryKeys = {
  claims: (spaceId: string, claimIds: string[]) => ['debates', 'claims', spaceId, claimIds] as const,
  spaceDebates: (spaceId: string) => ['debates', 'space', spaceId] as const,
  debate: (debateId: string) => ['debates', 'detail', debateId] as const,
  media: (debateId: string) => ['debates', 'media', debateId] as const,
  transcript: (debateId: string, format: TranscriptFormat) => ['debates', 'transcript', debateId, format] as const,
  activity: ['debates', 'activity'] as const,
  rematch: (sessionId: string) => ['debates', 'rematch', sessionId] as const,
  rematchClaims: (sessionId: string, claimIds: string[]) =>
    ['debates', 'rematch', sessionId, 'claims', claimIds] as const,
  sharePrompts: ['debates', 'share-prompts'] as const,
};

export function useGeoChatAuth() {
  const privy = usePrivy();
  const getPrivyIdentityToken = React.useCallback<GetPrivyIdentityToken>(() => getIdentityToken(), []);

  return {
    ready: privy.ready,
    authenticated: privy.authenticated,
    getPrivyIdentityToken,
  };
}

export function useDebateClaims(spaceId: string, claimIds: string[], enabled: boolean) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.claims(spaceId, claimIds),
    queryFn: () => listDebateClaims(spaceId, claimIds, getPrivyIdentityToken),
    enabled: enabled && claimIds.length > 0,
    refetchInterval: 5_000,
  });
}

export function useJoinDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId, request }: { claimId: string; request: JoinDebateQueueRequest }) =>
      joinDebateQueue(spaceId, claimId, request, getPrivyIdentityToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
    },
  });
}

export function useUpdateDebatePreference(spaceId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId, position }: { claimId: string; position: boolean }) =>
      updateDebatePreference(spaceId, claimId, { position }, getPrivyIdentityToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates'] }),
  });
}

export function useDebateActivity(enabled = true) {
  const { authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.activity,
    queryFn: () => getDebateActivity(getPrivyIdentityToken),
    enabled: enabled && authenticated,
    refetchInterval: 2_000,
  });
}

export function useDebatePresenceHeartbeat(enabled = true) {
  const queryClient = useQueryClient();
  const { authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: ['debates', 'presence-heartbeat'],
    queryFn: async () => {
      const activity = await heartbeatDebatePresence(getPrivyIdentityToken);
      await queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity });
      return activity;
    },
    enabled: enabled && authenticated,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });
}

export function useAcceptDebateMatch(spaceId?: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ matchId, formatId }: { matchId: string; formatId?: string }) =>
      acceptDebateMatch(matchId, getPrivyIdentityToken, formatId),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
      if (spaceId) void queryClient.invalidateQueries({ queryKey: debateQueryKeys.spaceDebates(spaceId) });
      if (result.debate) {
        queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
      }
    },
  });
}

export function useDeclineDebateMatch(spaceId?: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (matchId: string) => declineDebateMatch(matchId, getPrivyIdentityToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
      if (spaceId) void queryClient.invalidateQueries({ queryKey: debateQueryKeys.spaceDebates(spaceId) });
    },
  });
}

export function useSpaceDebates(spaceId: string, enabled: boolean) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.spaceDebates(spaceId),
    queryFn: () => listSpaceDebates(spaceId, getPrivyIdentityToken),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useDebate(debateId: string, enabled: boolean) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.debate(debateId),
    queryFn: () => getDebate(debateId, getPrivyIdentityToken),
    enabled,
    refetchInterval: 1_000,
  });
}

export function useLiveKitJoin(debateId: string) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => getLiveKitToken(debateId, getPrivyIdentityToken),
  });
}

export function useMarkDebateJoined(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => markDebateJoined(debateId, getPrivyIdentityToken),
    onSuccess: debate => queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate),
  });
}

export function useMarkDebateReady(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => markDebateReady(debateId, getPrivyIdentityToken),
    onSuccess: debate => queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate),
  });
}

export function useAbortDebate(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => abortDebate(debateId, getPrivyIdentityToken),
    onSuccess: debate => queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate),
  });
}

export function useConsentToDebateRematch(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => consentToDebateRematch(debateId, getPrivyIdentityToken),
    onSuccess: async session => {
      await queryClient.cancelQueries({ queryKey: debateQueryKeys.activity });
      queryClient.setQueryData(debateQueryKeys.rematch(session.id), session);
      queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity, current => ({
        online: current?.online ?? true,
        cooldown_until: null,
        match: null,
        debate: null,
        rematch: session,
      }));
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.debate(debateId) });
    },
  });
}

export function useDebateRematch(sessionId: string, enabled = true) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.rematch(sessionId),
    queryFn: () => getDebateRematch(sessionId, getPrivyIdentityToken),
    enabled: enabled && Boolean(sessionId),
    refetchInterval: 1_000,
  });
}

export function useLeaveDebateRematch(sessionId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => leaveDebateRematch(sessionId, getPrivyIdentityToken),
    onSuccess: session => {
      queryClient.setQueryData(debateQueryKeys.rematch(session.id), session);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity });
    },
  });
}

export function useDebateRematchClaims(sessionId: string, claimIds: string[] = [], enabled = true) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.rematchClaims(sessionId, claimIds),
    queryFn: () => listDebateRematchClaims(sessionId, claimIds, getPrivyIdentityToken),
    enabled: enabled && Boolean(sessionId),
    refetchInterval: 2_000,
  });
}

export function useUpdateDebateRematchPosition(sessionId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ claimId, position, sourceSpaceId }: { claimId: string; position: boolean; sourceSpaceId: string }) =>
      updateDebateRematchPosition(sessionId, claimId, position, sourceSpaceId, getPrivyIdentityToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['debates', 'rematch', sessionId, 'claims'] }),
  });
}

export function useCreateDebateRematchRequest(sessionId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: { source_space_id: string; claim_id: string; format_id: string }) =>
      createDebateRematchRequest(sessionId, request, getPrivyIdentityToken),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.rematch(sessionId), result.session);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity });
    },
  });
}

export function useAcceptDebateRematchRequest() {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (requestId: string) => acceptDebateRematchRequest(requestId, getPrivyIdentityToken),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.rematch(result.session.id), result.session);
      if (result.debate) queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.activity });
    },
  });
}

export function useRejectDebateRematchRequest() {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (requestId: string) => rejectDebateRematchRequest(requestId, getPrivyIdentityToken),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.rematch(result.session.id), result.session);
      void queryClient.invalidateQueries({ queryKey: ['debates', 'rematch', result.session.id, 'claims'] });
    },
  });
}

export function useDebateSharePrompts(enabled = true) {
  const { authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.sharePrompts,
    queryFn: () => listDebateSharePrompts(getPrivyIdentityToken),
    enabled: enabled && authenticated,
    refetchInterval: 5_000,
  });
}

export function useHandleDebateSharePrompt() {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ promptId, action }: { promptId: string; action: 'shared' | 'dismissed' }) =>
      handleDebateSharePrompt(promptId, action, getPrivyIdentityToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: debateQueryKeys.sharePrompts }),
  });
}

export function useCreateLocalRecordingUpload(debateId: string) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: LocalRecordingUploadRequest) =>
      createLocalRecordingUpload(debateId, request, getPrivyIdentityToken),
  });
}

export function useCompleteLocalRecordingUpload(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: LocalRecordingCompleteRequest) =>
      completeLocalRecordingUpload(debateId, request, getPrivyIdentityToken),
    onSuccess: result => {
      queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.media(result.debate.id) });
    },
  });
}

export function useRecordingUrl() {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ debateId, filename }: { debateId: string; filename: string }) =>
      getRecordingUrl(debateId, filename, getPrivyIdentityToken),
  });
}

export function useDebateMedia(debateId: string, enabled: boolean) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.media(debateId),
    queryFn: () => getDebateMedia(debateId, getPrivyIdentityToken),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useRequestDebateMediaProcessing(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request?: DebateMediaProcessRequest) =>
      requestDebateMediaProcessing(debateId, getPrivyIdentityToken, request),
    onSuccess: media => queryClient.setQueryData(debateQueryKeys.media(debateId), media),
  });
}

export function useDebateMediaArtifactUrl() {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ debateId, request }: { debateId: string; request: DebateMediaArtifactUrlRequest }) =>
      getDebateMediaArtifactUrl(debateId, request, getPrivyIdentityToken),
  });
}

export function useDebateTranscript(debateId: string, format: TranscriptFormat = 'json', enabled = true) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.transcript(debateId, format),
    queryFn: () => getDebateTranscript(debateId, format, getPrivyIdentityToken),
    enabled,
  });
}
