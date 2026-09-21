'use client';

import * as React from 'react';

import { capture } from '~/core/analytics';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';

import type { CreateCommentParams } from '~/partials/comments/types';

import { useCreateComment } from './use-create-comment';

type PublishCommentInput = Pick<CreateCommentParams, 'text' | 'ancestorComments'> & {
  onOptimistic?: (commentId: string) => void;
};

function recordPublishedComment({
  commentId,
  targetEntityId,
  targetSpaceId,
  parentCommentId,
}: {
  commentId: string;
  targetEntityId: string;
  targetSpaceId: string;
  parentCommentId?: string;
}) {
  try {
    capture('comment_created', {
      source: 'commenting',
      comment_id: commentId,
      target_type: 'entity',
      target_id: targetEntityId,
      space_id: targetSpaceId,
      parent_comment_id: parentCommentId,
    });
  } catch {
    /* Analytics must never turn a successful publish into a failed comment. */
  }
}

/**
 * The complete create-comment path used by every composer.
 *
 * `useCreateComment` owns the optimistic row and chain write. This wrapper owns the one remaining
 * workflow step: if the account exists but its personal space is still being created, retain that
 * optimistic entity and retry the same publish once the space is ready. Keeping that policy here
 * prevents a new comment surface from silently accepting a draft that can never reach the graph.
 */
export function usePublishComment(targetEntityId: string, targetSpaceId: string) {
  const { createComment, editComment, isCreating, error } = useCreateComment(targetEntityId);
  const enqueuePendingAction = useEnqueuePendingAction();

  const publishComment = React.useCallback(
    async ({ text, ancestorComments, onOptimistic }: PublishCommentInput) => {
      const result = await createComment({
        text,
        targetSpaceId,
        ancestorComments,
        onOptimistic,
      });

      if (!result) return result;

      if (result.published) {
        recordPublishedComment({
          commentId: result.id,
          targetEntityId,
          targetSpaceId,
          parentCommentId: ancestorComments?.[0]?.id,
        });
        return result;
      }

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
            if (!published?.published) throw new Error('Comment could not be published');
            recordPublishedComment({
              commentId: published.id,
              targetEntityId,
              targetSpaceId,
              parentCommentId: ancestorComments?.[0]?.id,
            });
          }),
      });

      return result;
    },
    [createComment, enqueuePendingAction, targetEntityId, targetSpaceId]
  );

  return { publishComment, editComment, isCreating, error };
}
