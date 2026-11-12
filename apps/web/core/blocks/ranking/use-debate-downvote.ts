'use client';

import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Either } from 'effect';

import { type ActionKind } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { classifyOperationFailure, observeOperation } from '~/core/analytics-operations';
import { readCachedPersonalSpace, readCachedSmartAccount } from '~/core/hooks/cached-write-identity';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import {
  EMPTY_PENDING_VOTED_OVERRIDES,
  type PendingVotedOverrides,
  clearPendingVotedEntity,
  restorePendingVotedEntry,
  suppressVotedId,
  userEntityVotesQueryKey,
  votedEntityIdsPendingQueryKey,
} from '~/core/hooks/use-user-voted-entity-ids';
import { ID } from '~/core/id';
import { marketingVoteDirection, pushMarketingEvent } from '~/core/marketing-events';
import {
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  userEntityResponseQueryKey,
  voteOutcomeProperties,
} from '~/core/responses/entity-response';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';
import { waitForIndexedValue } from '~/core/utils/wait-for-indexed-value';

import { DEBATES_SPACE_ID } from './best-debates';
import {
  type MemberVoteRecord,
  fetchMemberDebateVotes,
  memberDebateDownvotesQueryKey,
  memberDebateVotesQueryKey,
  voteInSpace,
} from './fetch-member-debate-votes';
import { PUSH_DOWN_VOTE_FAILED_COPY, type StepResult, UNDO_FAILED_COPY } from './push-down';

/** Curation votes are kind 0. */
const CURATION_VOTE_KIND = 0;

/**
 * An overlay stops trusting itself after this long, even if indexing was never confirmed: past it
 * the server's answer is the better guess.
 */
export const DEBATE_VOTE_OVERLAY_TTL_MS = 5 * 60 * 1000;

/**
 * What this session just wrote for the member's votes on a debate, held only until the indexer
 * has it: the full set of the member's curation votes on that debate as they now stand.
 */
export type DebateVoteOverlay = { records: MemberVoteRecord[]; writtenAtMs: number };
export type DebateVoteOverlays = Record<string, DebateVoteOverlay>;

const EMPTY_OVERLAYS: DebateVoteOverlays = {};

export function debateVoteOverlaysQueryKey(memberSpaceId: string | null | undefined) {
  return ['member-debate-vote-overlays', memberSpaceId ? ID.uuidToHex(memberSpaceId) : null] as const;
}

/** The overlay for one debate, if it is still fresh. */
export function freshOverlay(
  overlays: DebateVoteOverlays | undefined,
  debateId: string,
  nowMs = Date.now()
): DebateVoteOverlay | null {
  const overlay = overlays?.[ID.uuidToHex(debateId)];
  if (!overlay || nowMs - overlay.writtenAtMs > DEBATE_VOTE_OVERLAY_TTL_MS) return null;
  return overlay;
}

/**
 * The member's curation downvotes with this session's unindexed writes laid over them: a debate
 * with a fresh overlay is described by the overlay alone. Newest first.
 */
export function mergeDownvoteOverlays(
  serverDownvotes: readonly MemberVoteRecord[],
  overlays: DebateVoteOverlays | undefined,
  nowMs = Date.now()
): MemberVoteRecord[] {
  const overlaid = new Set<string>();
  const merged: MemberVoteRecord[] = [];
  for (const debateId of Object.keys(overlays ?? {})) {
    const overlay = freshOverlay(overlays, debateId, nowMs);
    if (!overlay) continue;
    overlaid.add(debateId);
    merged.push(...overlay.records.filter(record => record.direction === 'negative'));
  }
  for (const record of serverDownvotes) {
    if (!overlaid.has(ID.uuidToHex(record.objectId))) merged.push(record);
  }
  return merged.sort((a, b) => (a.votedAt < b.votedAt ? 1 : a.votedAt > b.votedAt ? -1 : 0));
}

export function useDebateVoteOverlays(): DebateVoteOverlays {
  const { personalSpaceId } = usePersonalSpaceId();
  const { data } = useQuery<DebateVoteOverlays>({
    queryKey: debateVoteOverlaysQueryKey(personalSpaceId),
    queryFn: () => EMPTY_OVERLAYS,
    // Seeded rather than fetched: a mount-time fetch resolving after a write would overwrite it.
    initialData: EMPTY_OVERLAYS,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? EMPTY_OVERLAYS;
}

function setOverlay(
  queryClient: QueryClient,
  memberSpaceId: string,
  debateId: string,
  records: MemberVoteRecord[],
  writtenAtMs: number
) {
  queryClient.setQueryData<DebateVoteOverlays>(
    debateVoteOverlaysQueryKey(memberSpaceId),
    (current = EMPTY_OVERLAYS) => ({ ...current, [ID.uuidToHex(debateId)]: { records, writtenAtMs } })
  );
}

function dropOverlay(queryClient: QueryClient, memberSpaceId: string, debateId: string, writtenAtMs: number) {
  queryClient.setQueryData<DebateVoteOverlays>(
    debateVoteOverlaysQueryKey(memberSpaceId),
    (current = EMPTY_OVERLAYS) => {
      const key = ID.uuidToHex(debateId);
      // A newer write on the same debate keeps its own overlay.
      if (!current[key] || current[key].writtenAtMs > writtenAtMs) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    }
  );
}

/** The member's votes on the debate after one write lands in `spaceId`. */
export function recordsAfterWrite(
  records: readonly MemberVoteRecord[],
  debateId: string,
  spaceId: string,
  direction: 'negative' | 'clear'
): MemberVoteRecord[] {
  const others = records.filter(record => !ID.equals(record.spaceId, spaceId));
  if (direction === 'clear') return others;
  return [
    {
      objectId: ID.uuidToHex(debateId),
      spaceId: ID.uuidToHex(spaceId),
      direction: 'negative',
      votedAt: new Date().toISOString(),
    },
    ...others,
  ];
}

export type DebateVoteWriteArgs = {
  debateId: string;
  /**
   * Where this one write goes: the debate's own space for a new downvote; for a clear, the space
   * that downvote was actually cast in.
   */
  spaceId: string;
  direction: 'negative' | 'clear';
  /** `push_down` for Push it down; `undo_push_down` for Undo and for clearing on a ranking. */
  analyticsAction: Extract<ActionKind, 'push_down' | 'undo_push_down'>;
  /** The member's curation votes on the debate before this write, every space. */
  records: readonly MemberVoteRecord[];
};

export type DebateVoteWriteResult = { ok: true; records: MemberVoteRecord[] } | Extract<StepResult, { ok: false }>;

/**
 * Sends one curation vote write for a member on a debate (a downvote, or clearing the vote in one
 * space) and resolves once it is included, so a ballot edit can follow without racing it for the
 * smart-account nonce.
 *
 * The same `geo.responses` calls as `useEntityResponse`, and the same catch-up once the indexer has
 * the vote (counts, the viewer's response, responders, the Upvoted/Downvoted lists, onboarding, the
 * indexed `vote_cast`), built from the helpers that hook uses. Not that hook itself: it is bound to
 * one (entity, space) at render time while a clear may have to reach several spaces, and its own
 * retry toast would double up with push-down's two-step retry.
 */
export function useDebateVoteWriter() {
  const tx = useSmartAccountTransaction();
  const queryClient = useQueryClient();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const getContext = useActionContext('ranking_composer', 'debate', '');

  return React.useCallback(
    async ({
      debateId,
      spaceId,
      direction,
      analyticsAction,
      records,
    }: DebateVoteWriteArgs): Promise<DebateVoteWriteResult> => {
      const failedCopy = direction === 'negative' ? PUSH_DOWN_VOTE_FAILED_COPY : UNDO_FAILED_COPY;
      const authorSpaceId =
        personalSpaceId && isRegistered
          ? personalSpaceId
          : readCachedPersonalSpace(queryClient, readCachedSmartAccount(queryClient, null)?.account.address)
              .personalSpaceId;
      if (!authorSpaceId) return { ok: false, message: 'You need a personal space to vote.' };
      if (!validateSpaceId(spaceId)) return { ok: false, message: failedCopy };
      // A new downvote belongs to the debate's own space: never the Debates space or the voter's
      // own. A clear goes wherever the existing downvote was cast.
      if (direction === 'negative' && (ID.equals(spaceId, DEBATES_SPACE_ID) || ID.equals(spaceId, authorSpaceId))) {
        return { ok: false, message: failedCopy };
      }

      const submitted = {
        ...voteOutcomeProperties({
          responseKind: 'curation',
          direction,
          previousResponse: voteInSpace(records, spaceId),
          entityId: debateId,
          spaceId,
        }),
      };
      const operation = observeOperation(
        analyticsAction,
        'debate',
        debateId,
        undefined,
        getContext({ target_type: 'debate', target_id: debateId })
      );

      const { to, calldata } = geo.responses[direction === 'negative' ? 'downvote' : 'unvote']({
        authorSpaceId,
        spaceId,
        entityId: debateId,
      });
      const result = await runEffectEither(tx({ to, data: calldata }));

      if (Either.isLeft(result)) {
        console.error('[useDebateVoteWriter] vote failed', { debateId, spaceId, direction }, result.left);
        operation.failed(classifyOperationFailure(result.left));
        return { ok: false, message: failedCopy };
      }

      const outcome = { ...submitted, user_operation_hash: result.right };
      operation.outcome('vote_cast', 'submitted', outcome);
      if (direction === 'negative') {
        pushMarketingEvent('geo_vote', {
          target_id: debateId,
          space_id: spaceId,
          vote_kind: 'curation',
          vote_direction: marketingVoteDirection('curation', 'negative'),
        });
      }

      const nextRecords = recordsAfterWrite(records, debateId, spaceId, direction);
      const writtenAtMs = Date.now();
      setOverlay(queryClient, authorSpaceId, debateId, nextRecords, writtenAtMs);

      // The profile tabs' Upvoted/Downvoted lists: shown at once, until the indexer has the vote.
      const stillDown = nextRecords.some(record => record.direction === 'negative');
      if (direction === 'negative') {
        queryClient.setQueryData<PendingVotedOverrides>(
          votedEntityIdsPendingQueryKey(authorSpaceId, 'up'),
          (current = EMPTY_PENDING_VOTED_OVERRIDES) => suppressVotedId(current, debateId)
        );
      }
      queryClient.setQueryData<PendingVotedOverrides>(
        votedEntityIdsPendingQueryKey(authorSpaceId, 'down'),
        (current = EMPTY_PENDING_VOTED_OVERRIDES) =>
          stillDown
            ? restorePendingVotedEntry(current, {
                entityId: debateId,
                voteKind: CURATION_VOTE_KIND,
                votedAt: new Date().toISOString(),
              })
            : suppressVotedId(current, debateId)
      );

      void catchUpAfterIndexing({
        queryClient,
        authorSpaceId,
        debateId,
        spaceId,
        direction,
        // A re-sent downvote is only indexed once its `voted_at` moves past the old one.
        previousVotedAt: records.find(record => ID.equals(record.spaceId, spaceId))?.votedAt ?? null,
        writtenAtMs,
        onIndexed: () => operation.outcome('vote_cast', 'indexed', outcome),
      });

      return { ok: true, records: nextRecords };
    },
    [getContext, isRegistered, personalSpaceId, queryClient, tx]
  );
}

/**
 * Waits until the indexer has the write: for a clear, no vote left in that space; for a downvote,
 * a downvote there newer than the one it replaced (re-sending a downvote only moves `voted_at`).
 * Polls for as long as the overlay lives. Then, indexed or not, refreshes what reads the vote, as
 * `useEntityResponse`'s reconciliation does, and ends the overlay, so the screen never falls back
 * to the cached answer from before the write.
 */
export async function catchUpAfterIndexing({
  queryClient,
  authorSpaceId,
  debateId,
  spaceId,
  direction,
  previousVotedAt,
  writtenAtMs,
  onIndexed,
  poll = { intervalMs: 2_000, maxAttempts: Math.ceil(DEBATE_VOTE_OVERLAY_TTL_MS / 2_000) },
}: {
  queryClient: QueryClient;
  authorSpaceId: string;
  debateId: string;
  spaceId: string;
  direction: 'negative' | 'clear';
  previousVotedAt: string | null;
  writtenAtMs: number;
  onIndexed?: () => void;
  poll?: { intervalMs: number; maxAttempts: number };
}): Promise<boolean> {
  const previousMs = previousVotedAt ? Date.parse(previousVotedAt) : null;
  const indexed = await waitForIndexedValue(
    async signal => {
      const records = await fetchMemberDebateVotes(authorSpaceId, debateId, { signal });
      const vote = records.find(record => ID.equals(record.spaceId, spaceId));
      if (direction === 'clear') return !vote;
      if (vote?.direction !== 'negative') return false;
      return previousMs == null || Date.parse(vote.votedAt) > previousMs;
    },
    true,
    poll.maxAttempts,
    poll.intervalMs,
    5_000
  );
  if (indexed) onIndexed?.();

  try {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: entityResponseCountsQueryKey(debateId, spaceId, 0, 'curation') }),
      queryClient.invalidateQueries({
        queryKey: userEntityResponseQueryKey(authorSpaceId, debateId, spaceId, 0, 'curation'),
      }),
      queryClient.invalidateQueries({ queryKey: entityRespondersQueryKey(debateId, spaceId, 0, 'curation') }),
      queryClient.invalidateQueries({ queryKey: memberDebateVotesQueryKey(authorSpaceId, debateId) }),
      queryClient.invalidateQueries({ queryKey: memberDebateDownvotesQueryKey(authorSpaceId) }),
      ...(['up', 'down'] as const).map(list =>
        queryClient.invalidateQueries({ queryKey: userEntityVotesQueryKey(authorSpaceId, list) })
      ),
    ]);
  } catch {
    // A failed refresh only delays the lists; keep the overlays until it has the answer.
    return indexed;
  }
  void queryClient.invalidateQueries({ queryKey: ['curator-onboarding-status'] });
  for (const list of ['up', 'down'] as const) {
    queryClient.setQueryData<PendingVotedOverrides>(
      votedEntityIdsPendingQueryKey(authorSpaceId, list),
      (current = EMPTY_PENDING_VOTED_OVERRIDES) => clearPendingVotedEntity(current, debateId)
    );
  }
  dropOverlay(queryClient, authorSpaceId, debateId, writtenAtMs);
  return indexed;
}
