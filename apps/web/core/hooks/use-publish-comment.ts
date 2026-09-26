'use client';

import * as React from 'react';

import { commentCreated, commentEdited } from '~/core/analytics';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';

import type { CreateCommentParams } from '~/partials/comments/types';

import { useCreateComment } from './use-create-comment';

type PublishCommentInput = Pick<CreateCommentParams, 'text' | 'ancestorComments'> & {
  onOptimistic?: (commentId: string) => void;
  /**
   * The comment did not make it, and `useCreateComment` has taken its optimistic row back out.
   *
   * Both ways that can happen report here, which is the point: callers were checking the returned
   * value, and that only sees the *first* attempt. A publish retained for a personal space that does
   * not exist yet returns truthy and is retried later — and when that retry failed, the row vanished
   * while every count and flag the caller had set for it stayed behind. There is no way for a caller
   * to observe that from the promise it was handed, so the policy belongs on this side of the call.
   *
   * Paired with {@link onOptimistic} as a transition rather than an event: at most one of the two is
   * outstanding at a time, so a retried publish that keeps failing does not report the same loss
   * repeatedly, and one that eventually succeeds reports the row back.
   */
  onFailed?: () => void;
};

type CommentAnalyticsContext = {
  targetEntityType?: string;
  interactionSurface?: string;
};

/**
 * The complete create-comment path used by every composer.
 *
 * `useCreateComment` owns the optimistic row and chain write. This wrapper owns the one remaining
 * workflow step: if the account exists but its personal space is still being created, retain that
 * optimistic entity and retry the same publish once the space is ready. Keeping that policy here
 * prevents a new comment surface from silently accepting a draft that can never reach the graph.
 */
export function usePublishComment(
  targetEntityId: string,
  targetSpaceId: string,
  { targetEntityType = 'entity', interactionSurface = 'comment_section' }: CommentAnalyticsContext = {}
) {
  const { createComment, editComment: updateComment, isCreating, error } = useCreateComment(targetEntityId);
  const enqueuePendingAction = useEnqueuePendingAction();

  const publishComment = React.useCallback(
    async ({ text, ancestorComments, onOptimistic, onFailed }: PublishCommentInput) => {
      const recordIfPublished = (result: Awaited<ReturnType<typeof createComment>>) => {
        if (!result?.published) return false;

        try {
          commentCreated(result.id, targetEntityId, {
            space_id: targetSpaceId,
            parent_comment_id: ancestorComments?.[0]?.id,
            target_entity_type: targetEntityType,
            interaction_surface: interactionSurface,
          });
        } catch {
          /* Analytics must never turn a successful publish into a failed comment. */
        }

        return true;
      };

      /**
       * Whether the caller is currently counting this comment — one flag for the whole lifecycle, the
       * first attempt and every queued retry alike.
       *
       * The two callbacks are a transition on it rather than an event per attempt, for two reasons
       * that turned up one round apart. `PendingActionsRunner` keeps a failed action queued and re-runs
       * it, so reporting per attempt took the count down once per retry — unbounded drift from one
       * comment. And `createComment` can fail *before* it inserts anything (no cached account, for
       * one), so the first attempt reporting a failure unconditionally gave back a count that was never
       * taken. A `-1` is only owed for a `+1` that was actually reported.
       */
      let countedByCaller = false;
      const countRow = (commentId: string) => {
        countedByCaller = true;
        onOptimistic?.(commentId);
      };
      const uncountRow = () => {
        if (!countedByCaller) return;
        countedByCaller = false;
        onFailed?.();
      };

      const result = await createComment({
        text,
        targetSpaceId,
        ancestorComments,
        onOptimistic: countRow,
      });

      if (!result) {
        uncountRow();
        return result;
      }
      if (recordIfPublished(result)) return result;

      enqueuePendingAction({
        id: `comment:${targetEntityId}:${result.id}`,
        label: 'your comment',
        requires: 'personalSpace',
        run: async () => {
          const published = await createComment({
            text,
            targetSpaceId,
            ancestorComments,
            commentId: result.id,
          });

          if (recordIfPublished(published)) {
            // A retry after a rollback: the comment exists again, so it counts again.
            if (!countedByCaller) countRow(result.id);
            return;
          }

          // The row is gone — `useCreateComment` removes it on a failed publish — so anything the
          // caller counted for this comment comes back before the error is surfaced.
          uncountRow();
          throw new Error('Comment could not be published');
        },
      });

      return result;
    },
    [createComment, enqueuePendingAction, interactionSurface, targetEntityId, targetEntityType, targetSpaceId]
  );

  const editComment = React.useCallback(
    async (input: Parameters<typeof updateComment>[0]) => {
      const published = await updateComment(input);
      if (!published) return false;

      try {
        commentEdited(input.commentId, targetEntityId, {
          space_id: targetSpaceId,
          target_entity_type: targetEntityType,
          interaction_surface: interactionSurface,
        });
      } catch {
        /* Analytics must never turn a successful edit into a failed comment. */
      }

      return true;
    },
    [interactionSurface, targetEntityId, targetEntityType, targetSpaceId, updateComment]
  );

  return { publishComment, editComment, isCreating, error };
}
