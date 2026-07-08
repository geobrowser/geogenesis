'use client';

import { getIdentityToken, usePrivy } from '@geogenesis/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateMediaArtifactUrlRequest,
  type DebateMediaProcessRequest,
  type GetPrivyIdentityToken,
  type JoinDebateQueueRequest,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  type TranscriptFormat,
  abortDebate,
  acceptDebateMatch,
  completeLocalRecordingUpload,
  createLocalRecordingUpload,
  declineDebateMatch,
  getDebate,
  getDebateMedia,
  getDebateMediaArtifactUrl,
  getDebateTranscript,
  getLiveKitToken,
  getRecordingUrl,
  joinDebateQueue,
  listDebateClaims,
  listSpaceDebates,
  markDebateJoined,
  requestDebateMediaProcessing,
} from './api';

export const debateQueryKeys = {
  claims: (spaceId: string, claimIds: string[]) => ['debates', 'claims', spaceId, claimIds] as const,
  spaceDebates: (spaceId: string) => ['debates', 'space', spaceId] as const,
  debate: (debateId: string) => ['debates', 'detail', debateId] as const,
  media: (debateId: string) => ['debates', 'media', debateId] as const,
  transcript: (debateId: string, format: TranscriptFormat) => ['debates', 'transcript', debateId, format] as const,
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

export function useAbortDebate(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => abortDebate(debateId, getPrivyIdentityToken),
    onSuccess: debate => queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate),
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
