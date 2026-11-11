'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GeoChatRequestError } from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { type MomentBackfillBody, getDebateTranscriptWords, getMomentBackfill, postMomentBackfill } from './api';
import { jobInFlight, reelJob } from './reel-status';

/** How often the editor reads a queued or rendering request again. */
export const REEL_JOB_POLL_MS = 4_000;

/** Media admins rarely change mid-visit; the answer is kept a while so the menu does not re-ask. */
const MEDIA_ADMIN_STALE_MS = 5 * 60_000;

export const momentsEditorQueryKeys = {
  /** Per viewer, not per debate: who is a media admin does not depend on the debate asked about. */
  mediaAdmin: (accountKey: string | null) => ['debates', 'account', accountKey, 'media-admin'] as const,
  backfill: (debateId: string, accountKey: string | null) =>
    ['debates', 'account', accountKey, 'moment-backfill', debateId] as const,
  plan: (debateId: string, accountKey: string | null) =>
    ['debates', 'account', accountKey, 'moment-reel-plan', debateId] as const,
  words: (debateId: string) => ['debates', 'transcript-words', debateId] as const,
};

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
    queryKey: momentsEditorQueryKeys.mediaAdmin(accountKey),
    queryFn: async ({ signal }) => {
      await getMomentBackfill(debateId, getPrivyIdentityToken, accountKey, signal);
      return true;
    },
    enabled: enabled && authenticated,
    staleTime: MEDIA_ADMIN_STALE_MS,
    retry: (failureCount, error) => !isMediaAdminRefusal(error) && failureCount < 2,
  });
  return query.data === true && !isMediaAdminRefusal(query.error);
}

/**
 * The debate's backfill request, read again every few seconds while it is queued or rendering, so
 * the editor's status follows the worker.
 */
export function useMomentBackfill(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: momentsEditorQueryKeys.backfill(debateId, accountKey),
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
    queryKey: momentsEditorQueryKeys.plan(debateId, accountKey),
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

/** The transcript with its words (GEO-3349), which the editor snaps and counts speakers with. */
export function useTranscriptWords(debateId: string, enabled: boolean) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: momentsEditorQueryKeys.words(debateId),
    queryFn: ({ signal }) => getDebateTranscriptWords(debateId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
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
        queryClient.setQueryData(momentsEditorQueryKeys.backfill(debateId, accountKey), {
          request: entry.request,
          entry,
        });
      }
      void queryClient.invalidateQueries({ queryKey: momentsEditorQueryKeys.backfill(debateId, accountKey) });
    },
  });
}

/** After a reel goes live: the plan's version and live cuts, and the served moments, are stale. */
export function useRefreshAfterReel(debateId: string) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return () => {
    void queryClient.invalidateQueries({ queryKey: momentsEditorQueryKeys.plan(debateId, accountKey) });
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.extractedClaims(debateId) });
  };
}
