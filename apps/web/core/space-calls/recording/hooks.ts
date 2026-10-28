'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type CallRecordingState, type DebateLobbyView, dashlessId } from '~/core/debates/api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '~/core/debates/hooks';
import { useStoreLobbyView } from '~/core/debates/lobbies/hooks';

import {
  getCallRecordingPlayback,
  listPastCalls,
  setCallRecordingPublished,
  startCallRecording,
  stopCallRecording,
} from './api';

/** Start or stop the call's one recording window (GEO-3421). Stores the returned view. */
export function useCallRecordingControl(callId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: (action: 'start' | 'stop') =>
      action === 'start'
        ? startCallRecording(callId, getPrivyIdentityToken, accountKey)
        : stopCallRecording(callId, getPrivyIdentityToken, accountKey),
    onSuccess: store,
  });
}

/** Publish or unpublish an ended call's recording; writes the returned state into the view. */
export function usePublishCallRecording(callId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (published: boolean) => setCallRecordingPublished(callId, published, getPrivyIdentityToken, accountKey),
    onSuccess: recording => {
      queryClient.setQueryData<DebateLobbyView>(debateQueryKeys.lobby(accountKey, callId), view =>
        view?.call ? withRecording(view, recording) : view
      );
    },
  });
}

function withRecording(view: DebateLobbyView, recording: CallRecordingState): DebateLobbyView {
  return { ...view, call: view.call ? { ...view.call, recording } : view.call };
}

/** Re-sign this long before the 4-hour URL lapses. */
const PLAYBACK_REFRESH_MARGIN_MS = 5 * 60_000;

export const callRecordingPlaybackKey = (callId: string, accountKey: string | null) =>
  ['call-recording-playback', dashlessId(callId), accountKey] as const;

/** The signed manifest for a ready recording, re-signed before it expires. */
export function useCallRecordingPlayback(callId: string, enabled: boolean) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const viewerKey = authenticated ? accountKey : null;

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: callRecordingPlaybackKey(callId, viewerKey),
    queryFn: ({ signal }) => getCallRecordingPlayback(callId, getPrivyIdentityToken, viewerKey, signal),
    enabled: enabled && ready,
    staleTime: Infinity,
    refetchInterval: query => {
      const expires = Date.parse(query.state.data?.expires_at ?? '');
      if (Number.isNaN(expires)) return false;
      return Math.max(expires - Date.now() - PLAYBACK_REFRESH_MARGIN_MS, 60_000);
    },
  });
}

/** geo-chat sends nothing when processing finishes after the call; the contract asks for 30–60s. */
export const PROCESSING_POLL_MS = 45_000;

/**
 * While an ended call's recording is processing, reads the member view again every
 * `PROCESSING_POLL_MS` with the tab visible. The guest view polls by itself.
 */
export function usePollWhileProcessing(callId: string, processing: boolean) {
  const { accountKey, authenticated } = useGeoChatAuth();
  const queryClient = useQueryClient();
  const active = processing && authenticated;

  React.useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobby(accountKey, callId), exact: true });
    }, PROCESSING_POLL_MS);
    return () => clearInterval(interval);
  }, [accountKey, active, callId, queryClient]);
}

/** Enough for several Explore pages; the list is small and changes rarely. */
export const PAST_CALLS_LIMIT = 20;
const PAST_CALLS_STALE_MS = 5 * 60_000;

/** Published past calls for Explore. Public; a failure leaves Explore as it was. */
export function usePastCalls(enabled: boolean) {
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: ['call-recordings', 'past', PAST_CALLS_LIMIT] as const,
    queryFn: ({ signal }) => listPastCalls(PAST_CALLS_LIMIT, signal),
    enabled,
    staleTime: PAST_CALLS_STALE_MS,
    select: data => data.calls,
  });
}
