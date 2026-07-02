'use client';

import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@geogenesis/auth';

import {
  type DebateSide,
  type GetPrivyAccessToken,
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

type PrivyWithToken = ReturnType<typeof usePrivy> & {
  getAccessToken?: () => Promise<string | null>;
};

export const debateQueryKeys = {
  questions: (spaceId: string, questionIds: string[]) => ['debates', 'questions', spaceId, questionIds] as const,
  spaceDebates: (spaceId: string) => ['debates', 'space', spaceId] as const,
  debate: (debateId: string) => ['debates', 'detail', debateId] as const,
};

export function useGeoChatAuth() {
  const privy = usePrivy() as PrivyWithToken;
  const getPrivyAccessToken = React.useCallback<GetPrivyAccessToken>(
    async () => privy.getAccessToken?.() ?? null,
    [privy]
  );

  return {
    ready: privy.ready,
    authenticated: privy.authenticated,
    getPrivyAccessToken,
  };
}

export function useDebateQuestions(spaceId: string, questionIds: string[], enabled: boolean) {
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.questions(spaceId, questionIds),
    queryFn: () => listDebateQuestions(spaceId, questionIds, getPrivyAccessToken),
    enabled: enabled && questionIds.length > 0,
    refetchInterval: 5_000,
  });
}

export function useJoinDebateQueue(spaceId: string) {
  const queryClient = useQueryClient();
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ questionId, request }: { questionId: string; request: JoinDebateQueueRequest }) =>
      joinDebateQueue(spaceId, questionId, request, getPrivyAccessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
    },
  });
}

export function useAcceptDebateMatch(spaceId?: string) {
  const queryClient = useQueryClient();
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ matchId, formatId }: { matchId: string; formatId?: string }) =>
      acceptDebateMatch(matchId, getPrivyAccessToken, formatId),
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
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (matchId: string) => declineDebateMatch(matchId, getPrivyAccessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debates'] });
      if (spaceId) void queryClient.invalidateQueries({ queryKey: debateQueryKeys.spaceDebates(spaceId) });
    },
  });
}

export function useSpaceDebates(spaceId: string, enabled: boolean) {
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.spaceDebates(spaceId),
    queryFn: () => listSpaceDebates(spaceId, getPrivyAccessToken),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useDebate(debateId: string, enabled: boolean) {
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useQuery({
    queryKey: debateQueryKeys.debate(debateId),
    queryFn: () => getDebate(debateId, getPrivyAccessToken),
    enabled,
    refetchInterval: 1_000,
  });
}

export function useLiveKitJoin(debateId: string) {
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => getLiveKitToken(debateId, getPrivyAccessToken),
  });
}

export function useMarkDebateJoined(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => markDebateJoined(debateId, getPrivyAccessToken),
    onSuccess: debate => queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate),
  });
}

export function useAbortDebate(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => abortDebate(debateId, getPrivyAccessToken),
    onSuccess: debate => queryClient.setQueryData(debateQueryKeys.debate(debate.id), debate),
  });
}

export function useCreateLocalRecordingUpload(debateId: string) {
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: LocalRecordingUploadRequest) =>
      createLocalRecordingUpload(debateId, request, getPrivyAccessToken),
  });
}

export function useCompleteLocalRecordingUpload(debateId: string) {
  const queryClient = useQueryClient();
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: (request: LocalRecordingCompleteRequest) =>
      completeLocalRecordingUpload(debateId, request, getPrivyAccessToken),
    onSuccess: result => queryClient.setQueryData(debateQueryKeys.debate(result.debate.id), result.debate),
  });
}

export function useRecordingUrl() {
  const { getPrivyAccessToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: ({ debateId, filename }: { debateId: string; filename: string }) =>
      getRecordingUrl(debateId, filename, getPrivyAccessToken),
  });
}

export function oppositeSide(side: DebateSide) {
  return side === 'for' ? 'against' : 'for';
}
