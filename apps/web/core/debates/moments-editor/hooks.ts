'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { GeoChatRequestError, getDebateTranscript } from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import {
  type AudioPeaksReady,
  type AudioPeaksStatus,
  type MomentBackfillBody,
  type MomentsTranscript,
  getAudioPeaks,
  getMomentBackfill,
  getMomentsTranscript,
  postMomentBackfill,
} from './api';
import { isTranscriptWaiting, transcriptPollDelay, transcriptSettled } from './moments-transcript';
import { jobInFlight, reelJob } from './reel-status';
import { PEAKS_GIVE_UP_MS, type PeaksView, decodePeaks, isPeaksWaiting, peaksPollDelay, peaksView } from './waveform';

/** How often the editor reads a queued or rendering request again. */
export const REEL_JOB_POLL_MS = 4_000;

/** Media admins rarely change mid-visit; the answer is kept a while so the menu does not re-ask. */
const MEDIA_ADMIN_STALE_MS = 5 * 60_000;

/** How long the editor's words are kept before the next open asks again (GEO-3642). */
const TRANSCRIPT_STALE_MS = 5 * 60_000;

/** What the editor snaps to and lists: every word, and whole sentences. */
const TRANSCRIPT_INCLUDE = ['words', 'sentences'] as const;

/**
 * geo-chat's answer that the viewer is not a media admin: off the allowlist (403
 * `media_admin_required`) or none configured (503 `media_admin_not_configured`). A 401 is a session
 * that expired, which says nothing about the allowlist.
 */
export function isMediaAdminRefusal(error: unknown) {
  return (
    error instanceof GeoChatRequestError &&
    (error.status === 403 || error.code === 'media_admin_required' || error.code === 'media_admin_not_configured')
  );
}

/**
 * Whether the viewer is a media admin (GEO-3671), by asking geo-chat's admin read for `debateId`: a
 * refusal hides "Edit moments", an answer shows it. Signed out, nothing is asked. The server stays
 * the gate: every write it is then sent checks again.
 */
export function useIsMediaAdmin(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.mediaAdmin(accountKey),
    // A refusal is an answer, kept as data like a yes: as an error it would have no data, which
    // React Query treats as stale whatever `staleTime` says, and every card the feed activates
    // would ask geo-chat again.
    queryFn: async ({ signal }) => {
      try {
        await getMomentBackfill(debateId, getPrivyIdentityToken, accountKey, signal);
        return true;
      } catch (error) {
        if (isMediaAdminRefusal(error)) return false;
        throw error;
      }
    },
    enabled: enabled && authenticated,
    staleTime: MEDIA_ADMIN_STALE_MS,
    retry: (failureCount, error) => !isMediaAdminRefusal(error) && failureCount < 2,
  });
  return query.data === true;
}

/**
 * The debate's backfill request, read again every few seconds while it is queued or rendering, so
 * the editor's status follows the worker.
 */
export function useMomentBackfill(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.momentBackfill(debateId, accountKey),
    queryFn: ({ signal }) => getMomentBackfill(debateId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
    retry: (failureCount, error) => !isMediaAdminRefusal(error) && failureCount < 2,
    refetchInterval: query => (jobInFlight(reelJob(query.state.data?.request)) ? REEL_JOB_POLL_MS : false),
  });
}

/**
 * The dry run the editor opens with (`apply: false`): whether a hand-picked reel would be taken for
 * this debate now, and if not why, with the reel's version and, from a geo-chat new enough, the
 * cuts that play now. Asked as an unlock, which is what gets past a hand-picked reel's lock without
 * naming any clips, so a debate with one reads as editable. Nothing is written.
 */
export function useMomentReelPlan(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.momentReelPlan(debateId, accountKey),
    queryFn: ({ signal }) =>
      postMomentBackfill(
        { debate_ids: [debateId], apply: false, unlock: true },
        getPrivyIdentityToken,
        accountKey,
        signal
      ),
    enabled: enabled && authenticated,
    retry: (failureCount, error) => !isMediaAdminRefusal(error) && failureCount < 2,
  });
}

/**
 * Queues a request: a preview, a hand-picked reel, or a return to automatic. The request's status is
 * written straight into the backfill read, which then polls it until the worker is done.
 */
export function useQueueMomentReel(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  return useMutation({
    mutationFn: (body: Omit<MomentBackfillBody, 'debate_ids' | 'apply'>) =>
      postMomentBackfill({ ...body, debate_ids: [debateId], apply: true }, getPrivyIdentityToken, accountKey),
    onSuccess: entry => {
      if (entry?.request) {
        queryClient.setQueryData(debateQueryKeys.momentBackfill(debateId, accountKey), {
          request: entry.request,
          entry,
        });
      }
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.momentBackfill(debateId, accountKey) });
    },
  });
}

/**
 * After a reel goes live, or the editor learns the reel moved on: the plan's version and live cuts,
 * and the served moments, are stale. So are the media's turns when a re-render moved the video: the
 * editor maps every live cut onto the player's clock through them. And so is the transcript, which a
 * re-render that re-extracts claims has changed: the editor snaps edges to its words, and counts a
 * clip's speaker and problems with them (every `include`, by prefix).
 */
export function useRefreshAfterReel(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return () => {
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.momentReelPlan(debateId, accountKey) });
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.extractedClaims(debateId) });
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.media(debateId) });
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.transcripts(debateId) });
  };
}

/**
 * The debate's audio peaks for the editor's waveform (GEO-3673). The first read asks geo-chat to
 * build them if it hasn't; while they are built, they are read again every 5 s, then every 15 s after
 * two minutes, and not at all after ten, when the editor says it is still waiting. Once ready they are
 * kept for the visit. A geo-chat without the route (404), or any error, is no waveform: the editor
 * works the same without one.
 */
export function useAudioPeaks(debateId: string, enabled: boolean): PeaksView {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  // When this visit first saw the peaks being built: the ten minutes count from there, so reopening
  // the editor later waits afresh.
  const waitingSince = React.useRef<number | null>(null);
  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.audioPeaks(debateId, accountKey),
    queryFn: async ({ signal }): Promise<AudioPeaksStatus | null> => {
      try {
        return await getAudioPeaks(debateId, getPrivyIdentityToken, accountKey, signal);
      } catch (error) {
        if (error instanceof GeoChatRequestError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: enabled && authenticated,
    retry: (failureCount, error) => !isMediaAdminRefusal(error) && failureCount < 2,
    // Ready peaks don't change under the same recordings; anything else is asked again on the next open.
    staleTime: query => (query.state.data?.status === 'ready' ? Infinity : 0),
    refetchInterval: query => {
      if (!isPeaksWaiting(query.state.data)) return false;
      waitingSince.current ??= Date.now();
      return peaksPollDelay(Date.now() - waitingSince.current);
    },
  });

  const waiting = isPeaksWaiting(query.data);
  const [gaveUp, setGaveUp] = React.useState(false);
  React.useEffect(() => {
    if (!waiting) {
      waitingSince.current = null;
      setGaveUp(false);
      return;
    }
    waitingSince.current ??= Date.now();
    const left = PEAKS_GIVE_UP_MS - (Date.now() - waitingSince.current);
    if (left <= 0) {
      setGaveUp(true);
      return;
    }
    const timer = setTimeout(() => setGaveUp(true), left);
    return () => clearTimeout(timer);
  }, [waiting]);

  const data = query.data;
  const ready: AudioPeaksReady | null = data?.status === 'ready' ? (data as AudioPeaksReady) : null;
  // Decoded once per answer: React Query hands back the same object while the peaks are the same.
  const peaks = React.useMemo(() => (ready ? decodePeaks(ready) : null), [ready]);
  return peaksView({
    status: query.data,
    failed: query.isError,
    pending: query.isPending,
    gaveUp,
    peaks,
  });
}

/**
 * The transcript the moments editor snaps to (GEO-3642), from geo-chat's media-admin route: the
 * published words, or for a debate published without them, a fresh transcription geo-chat saves for
 * the editor. The first read queues it; while it is queued or running it is read every 15 s, then
 * every minute after ten, for as long as it takes (geo-chat always moves the status on). A geo-chat
 * without the route (404), or one that refuses it (403/503), is read through the public transcript
 * as before: read-only for these debates.
 */
export function useMomentsTranscript(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  // When this visit first saw it waiting: the backoff counts from there.
  const waitingSince = React.useRef<number | null>(null);
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.momentsTranscript(debateId, accountKey),
    queryFn: async ({ signal }): Promise<MomentsTranscript> => {
      try {
        return await getMomentsTranscript(debateId, getPrivyIdentityToken, accountKey, signal);
      } catch (error) {
        const older = error instanceof GeoChatRequestError && error.status === 404;
        if (!older && !isMediaAdminRefusal(error)) throw error;
        return getDebateTranscript(debateId, 'json', getPrivyIdentityToken, accountKey, signal, TRANSCRIPT_INCLUDE);
      }
    },
    enabled: enabled && authenticated,
    retry: (failureCount, error) => !isMediaAdminRefusal(error) && failureCount < 2,
    // Words are kept a while, never for good: a re-render can change them under the same visit (and
    // the refresh after one reads them again). Anything else (being made, failed, unavailable) is
    // asked again on every open, as its copy says, and as `useAudioPeaks` does.
    staleTime: query => (transcriptSettled(query.state.data) ? TRANSCRIPT_STALE_MS : 0),
    refetchInterval: query => {
      if (!isTranscriptWaiting(query.state.data)) {
        waitingSince.current = null;
        return false;
      }
      waitingSince.current ??= Date.now();
      return transcriptPollDelay(Date.now() - waitingSince.current);
    },
  });
}
