'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

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
  restorePendingVotedEntry,
  suppressVotedId,
  votedEntityIdsPendingQueryKey,
} from '~/core/hooks/use-user-voted-entity-ids';
import { ID } from '~/core/id';
import {
  type ActiveResponseDirection,
  entityResponseCountsQueryKey,
  userEntityResponseQueryKey,
  voteOutcomeProperties,
} from '~/core/responses/entity-response';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';

import { DEBATES_SPACE_ID } from './best-debates';
import { PUSH_DOWN_VOTE_FAILED_COPY, type StepResult, UNDO_FAILED_COPY } from './push-down';

/** Curation votes are kind 0; a downvote is vote type 1. */
const CURATION_VOTE_KIND = 0;

/**
 * What this session last wrote for a member's vote on a debate, held beside the server answer:
 * the indexer lags the write, so a refetch inside that gap would otherwise flip the debate back.
 * `pushed` = downvoted, `cleared` = no vote.
 */
export type DebateDownvoteOverride = 'pushed' | 'cleared' | null;

export function debateDownvoteOverrideQueryKey(personalSpaceId: string | null | undefined, debateId: string) {
  return ['debate-downvote-override', personalSpaceId ?? null, ID.uuidToHex(debateId)] as const;
}

export function useDebateDownvoteOverride(debateId: string): DebateDownvoteOverride {
  const { personalSpaceId } = usePersonalSpaceId();
  const { data } = useQuery<DebateDownvoteOverride>({
    queryKey: debateDownvoteOverrideQueryKey(personalSpaceId, debateId),
    queryFn: () => null,
    // Seeded rather than fetched: a mount-time fetch resolving after a write would overwrite it.
    initialData: null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? null;
}

export type DebateDownvoteArgs = {
  debateId: string;
  /** The debate's own space (`debateOwnSpaceId`). */
  spaceId: string;
  direction: 'negative' | 'clear';
  /** `push_down` for Push it down; `undo_push_down` for Undo and for clearing before a ranking. */
  analyticsAction: Extract<ActionKind, 'push_down' | 'undo_push_down'>;
  /** The side held before this vote, for the outcome event. */
  previousResponse?: ActiveResponseDirection | null;
};

/**
 * Sends a member's downvote on a debate, or clears it, and resolves once it has landed (included),
 * so a ballot edit can follow without racing it for the smart-account nonce.
 *
 * Built on the same `geo.responses` calls as `useEntityResponse`, without its per-control
 * optimistic state and retry toast: push-down owns its own two-step state and retry, and two retry
 * prompts for one failure would be one too many. The viewer's Downvoted list, their own response
 * and the counts are brought up to date here instead.
 */
export function useDebateDownvoteWriter() {
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
      previousResponse,
    }: DebateDownvoteArgs): Promise<StepResult> => {
      const failedCopy = direction === 'negative' ? PUSH_DOWN_VOTE_FAILED_COPY : UNDO_FAILED_COPY;
      const authorSpaceId =
        personalSpaceId && isRegistered
          ? personalSpaceId
          : readCachedPersonalSpace(queryClient, readCachedSmartAccount(queryClient, null)?.account.address)
              .personalSpaceId;
      if (!authorSpaceId) return { ok: false, message: 'You need a personal space to vote.' };
      // The vote belongs to the debate's own space: never the Debates space, never the voter's own.
      if (!validateSpaceId(spaceId) || ID.equals(spaceId, DEBATES_SPACE_ID) || ID.equals(spaceId, authorSpaceId)) {
        return { ok: false, message: failedCopy };
      }

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
        console.error('[useDebateDownvoteWriter] vote failed', { debateId, spaceId, direction }, result.left);
        operation.failed(classifyOperationFailure(result.left));
        return { ok: false, message: failedCopy };
      }

      operation.outcome('vote_cast', 'submitted', {
        ...voteOutcomeProperties({
          responseKind: 'curation',
          direction,
          previousResponse,
          entityId: debateId,
          spaceId,
        }),
        user_operation_hash: result.right,
      });

      queryClient.setQueryData<DebateDownvoteOverride>(
        debateDownvoteOverrideQueryKey(authorSpaceId, debateId),
        direction === 'negative' ? 'pushed' : 'cleared'
      );
      queryClient.setQueryData<ActiveResponseDirection | null>(
        userEntityResponseQueryKey(authorSpaceId, debateId, spaceId, 0, 'curation'),
        direction === 'negative' ? 'negative' : null
      );
      // A downvote replaces an upvote, and clearing leaves neither list holding it.
      queryClient.setQueryData<PendingVotedOverrides>(
        votedEntityIdsPendingQueryKey(authorSpaceId, 'up'),
        (current = EMPTY_PENDING_VOTED_OVERRIDES) => suppressVotedId(current, debateId)
      );
      queryClient.setQueryData<PendingVotedOverrides>(
        votedEntityIdsPendingQueryKey(authorSpaceId, 'down'),
        (current = EMPTY_PENDING_VOTED_OVERRIDES) =>
          direction === 'negative'
            ? restorePendingVotedEntry(current, {
                entityId: debateId,
                voteKind: CURATION_VOTE_KIND,
                votedAt: new Date().toISOString(),
              })
            : suppressVotedId(current, debateId)
      );
      void queryClient.invalidateQueries({ queryKey: entityResponseCountsQueryKey(debateId, spaceId, 0, 'curation') });

      return { ok: true };
    },
    [getContext, isRegistered, personalSpaceId, queryClient, tx]
  );
}
