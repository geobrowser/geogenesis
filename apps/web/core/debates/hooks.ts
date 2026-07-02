'use client';

import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getIdentityToken, usePrivy } from '@geogenesis/auth';

import {
  type DebateSide,
  type GetPrivyIdentityToken,
  type JoinDebateQueueRequest,
  type LocalRecordingCompleteRequest,
  type LocalRecordingUploadRequest,
  abortDebate,
  acceptDebateMatch,
  completeLocalRecordingUpload,
  createLocalRecordingUpload,
  declineDebateMatch,
  getDebate,
  getLiveKitToken,
  getRecordingUrl,
  joinDebateQueue,
  listDebateQuestions,
  listSpaceDebates,
  markDebateJoined,
} from './api';

export const debateQueryKeys = {
  questions: (spaceId: string, questionIds: string[]) => ['debates', 'questions', spaceId, questionIds] as const,
  spaceDebates: (spaceId: string) => ['debates', 'space', spaceId] as const,
  debate: (debateId: string) => ['debates', 'detail', debateId] as const,
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

export function useDebateQuestions(spaceId: string, questionIds: string[], enabled: boolean) {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.questions(spaceId, questionIds),
    queryFn: () => listDebateQuestions(spaceId, questionIds, getPrivyIdentityToken),
    enabled: enabled && questionIds.length > 0,
    refetchInterval: 5_000,
  });
}

export function useJoinDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ questionId, request }: { questionId: string; request: JoinDebateQueueRequest }) =>
      joinDebateQueue(spaceId, questionId, request, getPrivyIdentityToken),
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
    onSuccess: result => queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate),
  });
}

export function useRecordingUrl() {
  const { getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ debateId, filename }: { debateId: string; filename: string }) =>
      getRecordingUrl(debateId, filename, getPrivyIdentityToken),
  });
}

export function oppositeSide(side: DebateSide) {
  return side === 'for' ? 'against' : 'for';
}
