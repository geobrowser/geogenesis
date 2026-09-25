'use client';

import * as React from 'react';

import { commentCreated, commentEdited } from '~/core/analytics';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';

import type { CreateCommentParams } from '~/partials/comments/types';

import { useCreateComment } from './use-create-comment';

type PublishCommentInput = Pick<CreateCommentParams, 'text' | 'ancestorComments'> & {
  onOptimistic?: (commentId: string) => void;
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
    async ({ text, ancestorComments, onOptimistic }: PublishCommentInput) => {
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

      const result = await createComment({
        text,
        targetSpaceId,
        ancestorComments,
        onOptimistic,
      });

      if (!result) return result;
      if (recordIfPublished(result)) return result;

      enqueuePendingAction({
        id: `comment:${targetEntityId}:${result.id}`,
        label: 'your comment',
        requires: 'personalSpace',
        run: () =>
          createComment({
            text,
            targetSpaceId,
            ancestorComments,
            commentId: result.id,
          }).then(published => {
            if (!recordIfPublished(published)) throw new Error('Comment could not be published');
          }),
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
