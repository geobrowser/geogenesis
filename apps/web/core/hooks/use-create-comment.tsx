'use client';

import { personalSpace } from '@geoprotocol/geo-sdk';
import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import {
  COMMENT_MARKDOWN_CONTENT_ID,
  COMMENT_NAME_PROPERTY_ID,
  COMMENT_REPLY_TO_ID,
  COMMENT_RESOLVED_ID,
  COMMENT_TYPES_PROPERTY_ID,
  COMMENT_TYPE_ID,
} from '~/core/comment-ids';
import { TransactionWriteFailedError } from '~/core/errors';
import { createValueId } from '~/core/id/create-id';
import { getSpace } from '~/core/io/queries';
import type { Relation, Value } from '~/core/types';
import { Publish } from '~/core/utils/publish';

import type { CommentEntity, CreateCommentParams } from '~/partials/comments/types';

import { usePersonalSpaceId } from './use-personal-space-id';
import { useSmartAccount } from './use-smart-account';
import { useToast } from './use-toast';

/** Generate a short name from the first ~20 chars of markdown text, stripping formatting. */
function getCommentName(markdown: string): string {
  const plain = markdown
    .replace(/[#*_~`>\[\]()!]/g, '')
    .replace(/\n/g, ' ')
    .trim();
  if (plain.length <= 20) return plain || 'Comment';
  return plain.slice(0, 20).trimEnd() + '...';
}

function retrySchedule(label: string, maxDuration: Duration.DurationInput) {
  return Schedule.exponential('100 millis').pipe(
    Schedule.jittered,
    Schedule.compose(Schedule.elapsed),
    Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.decode(maxDuration)))
  );
}

export function useCreateComment(targetEntityId: string) {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId } = usePersonalSpaceId();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();

  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const createComment = React.useCallback(
    async ({
      text,
      targetSpaceId,
      replyToCommentId,
      replyToCommentSpaceId,
    }: Omit<CreateCommentParams, 'targetEntityId'>) => {
      if (!smartAccount) {
        setToast(<span>Please connect your wallet to comment</span>);
        return;
      }

      if (!personalSpaceId) {
        setToast(<span>Personal space required to comment. Please complete onboarding.</span>);
        return;
      }

      setIsCreating(true);
      setError(null);

      try {
        const commentEntityId = IdUtils.generate();
        const commentName = getCommentName(text);

        // Build values
        const values: Value[] = [];
        const relations: Relation[] = [];

        // 1. Name value
        values.push({
          id: createValueId({
            entityId: commentEntityId,
            propertyId: COMMENT_NAME_PROPERTY_ID,
            spaceId: personalSpaceId,
          }),
          entity: { id: commentEntityId, name: commentName },
          property: { id: COMMENT_NAME_PROPERTY_ID, name: 'Name', dataType: 'TEXT' },
          spaceId: personalSpaceId,
          value: commentName,
          isLocal: true,
          hasBeenPublished: false,
        });

        // 2. Markdown Content value
        values.push({
          id: createValueId({
            entityId: commentEntityId,
            propertyId: COMMENT_MARKDOWN_CONTENT_ID,
            spaceId: personalSpaceId,
          }),
          entity: { id: commentEntityId, name: commentName },
          property: { id: COMMENT_MARKDOWN_CONTENT_ID, name: 'Markdown content', dataType: 'TEXT' },
          spaceId: personalSpaceId,
          value: text,
          isLocal: true,
          hasBeenPublished: false,
        });

        // 3. Resolved value (default false)
        values.push({
          id: createValueId({ entityId: commentEntityId, propertyId: COMMENT_RESOLVED_ID, spaceId: personalSpaceId }),
          entity: { id: commentEntityId, name: commentName },
          property: { id: COMMENT_RESOLVED_ID, name: 'Resolved', dataType: 'BOOLEAN' },
          spaceId: personalSpaceId,
          value: '0',
          isLocal: true,
          hasBeenPublished: false,
        });

        // 4. Types relation → Comment type
        relations.push({
          id: IdUtils.generate(),
          entityId: IdUtils.generate(),
          spaceId: personalSpaceId,
          renderableType: 'RELATION',
          position: Position.generate(),
          type: { id: COMMENT_TYPES_PROPERTY_ID, name: 'Types' },
          fromEntity: { id: commentEntityId, name: commentName },
          toEntity: { id: COMMENT_TYPE_ID, name: 'Comment', value: COMMENT_TYPE_ID },
          isLocal: true,
          hasBeenPublished: false,
        });

        // 5. Reply To relation → target entity (the entity being commented on)
        relations.push({
          id: IdUtils.generate(),
          entityId: IdUtils.generate(),
          spaceId: personalSpaceId,
          renderableType: 'RELATION',
          position: Position.generate(),
          type: { id: COMMENT_REPLY_TO_ID, name: 'Reply to' },
          fromEntity: { id: commentEntityId, name: commentName },
          toEntity: { id: targetEntityId, name: null, value: targetEntityId },
          toSpaceId: targetSpaceId,
          isLocal: true,
          hasBeenPublished: false,
        });

        // 6. If replying to another comment, add additional Reply To relation
        if (replyToCommentId) {
          relations.push({
            id: IdUtils.generate(),
            entityId: IdUtils.generate(),
            spaceId: personalSpaceId,
            renderableType: 'RELATION',
            position: Position.generate(),
            type: { id: COMMENT_REPLY_TO_ID, name: 'Reply to' },
            fromEntity: { id: commentEntityId, name: commentName },
            toEntity: { id: replyToCommentId, name: null, value: replyToCommentId },
            toSpaceId: replyToCommentSpaceId,
            isLocal: true,
            hasBeenPublished: false,
          });
        }

        // Fetch author info for optimistic update
        const space = await Effect.runPromise(getSpace(personalSpaceId));
        if (!space) {
          setToast(<span>Failed to resolve personal space</span>);
          setIsCreating(false);
          return;
        }

        // Optimistically add comment to the query cache
        const optimisticComment: CommentEntity = {
          id: commentEntityId,
          name: commentName,
          markdownContent: text,
          targetEntityId,
          targetSpaceId,
          replyToCommentId: replyToCommentId ?? null,
          replyToCommentSpaceId: replyToCommentSpaceId ?? null,
          author: {
            spaceId: personalSpaceId,
            address: smartAccount.account.address,
            name: space.entity.name,
            avatarUrl: null, // Will resolve on next fetch
          },
          createdAt: new Date().toISOString(),
          spaceId: personalSpaceId,
          resolved: false,
        };

        queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) => [
          ...old,
          optimisticComment,
        ]);

        // Publish to personal space
        const publish = Effect.gen(function* () {
          const ops = yield* Publish.prepareLocalDataForPublishing(values, relations, personalSpaceId);

          if (ops.length === 0) {
            throw new Error('No operations to publish');
          }

          const result = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                personalSpace.publishEdit({
                  name: `Comment: ${commentName}`,
                  spaceId: space.id,
                  ops,
                  author: personalSpaceId,
                  network: 'TESTNET',
                }),
              catch: error => new TransactionWriteFailedError('IPFS upload failed', { cause: error }),
            }),
            retrySchedule('publishEdit', Duration.minutes(1))
          );

          const txHash = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                smartAccount.sendUserOperation({
                  calls: [{ to: result.to, value: 0n, data: result.calldata }],
                }),
              catch: error => new TransactionWriteFailedError('Transaction failed', { cause: error }),
            }),
            retrySchedule('sendUserOperation', Duration.seconds(10))
          );

          return txHash;
        });

        const result = await Effect.runPromise(Effect.either(publish));

        if (Either.isLeft(result)) {
          const err = result.left;

          // Roll back optimistic update
          queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
            old.filter(c => c.id !== commentEntityId)
          );

          // Handle user rejection silently
          if (err instanceof Error && err.message.includes('User rejected')) {
            return;
          }

          console.error('[useCreateComment] Publish failed:', err);
          setToast(<span>Failed to publish comment</span>);
          setError(err as Error);
          return;
        }

        setToast(<span>Comment published!</span>);

        // Refetch from server after a delay to let the indexer catch up
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['comments', targetEntityId] });
        }, 5000);
      } catch (err) {
        console.error('[useCreateComment] Error creating comment:', err);
        setToast(<span>Failed to create comment</span>);
        setError(err as Error);
      } finally {
        setIsCreating(false);
      }
    },
    [smartAccount, personalSpaceId, targetEntityId, queryClient, setToast]
  );

  const editComment = React.useCallback(
    async ({ commentId, commentSpaceId, newText }: { commentId: string; commentSpaceId: string; newText: string }) => {
      if (!smartAccount) {
        setToast(<span>Please connect your wallet to edit</span>);
        return;
      }

      if (!personalSpaceId) {
        setToast(<span>Personal space required. Please complete onboarding.</span>);
        return;
      }

      // Can only edit your own comments (published to your personal space)
      if (commentSpaceId !== personalSpaceId) {
        setToast(<span>You can only edit your own comments</span>);
        return;
      }

      setIsCreating(true);
      setError(null);

      try {
        const newName = getCommentName(newText);

        // Build updated values for the existing comment entity
        const values: Value[] = [
          {
            id: createValueId({ entityId: commentId, propertyId: COMMENT_NAME_PROPERTY_ID, spaceId: personalSpaceId }),
            entity: { id: commentId, name: newName },
            property: { id: COMMENT_NAME_PROPERTY_ID, name: 'Name', dataType: 'TEXT' },
            spaceId: personalSpaceId,
            value: newName,
            isLocal: true,
            hasBeenPublished: false,
          },
          {
            id: createValueId({
              entityId: commentId,
              propertyId: COMMENT_MARKDOWN_CONTENT_ID,
              spaceId: personalSpaceId,
            }),
            entity: { id: commentId, name: newName },
            property: { id: COMMENT_MARKDOWN_CONTENT_ID, name: 'Markdown content', dataType: 'TEXT' },
            spaceId: personalSpaceId,
            value: newText,
            isLocal: true,
            hasBeenPublished: false,
          },
        ];

        // Optimistically update the comment in the query cache
        queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
          old.map(c => (c.id === commentId ? { ...c, markdownContent: newText, name: newName } : c))
        );

        const space = await Effect.runPromise(getSpace(personalSpaceId));
        if (!space) {
          setToast(<span>Failed to resolve personal space</span>);
          setIsCreating(false);
          return;
        }

        const publish = Effect.gen(function* () {
          const ops = yield* Publish.prepareLocalDataForPublishing(values, [], personalSpaceId);

          if (ops.length === 0) {
            throw new Error('No operations to publish');
          }

          const result = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                personalSpace.publishEdit({
                  name: `Edit comment: ${newName}`,
                  spaceId: space.id,
                  ops,
                  author: personalSpaceId,
                  network: 'TESTNET',
                }),
              catch: error => new TransactionWriteFailedError('IPFS upload failed', { cause: error }),
            }),
            retrySchedule('publishEdit', Duration.minutes(1))
          );

          const txHash = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                smartAccount.sendUserOperation({
                  calls: [{ to: result.to, value: 0n, data: result.calldata }],
                }),
              catch: error => new TransactionWriteFailedError('Transaction failed', { cause: error }),
            }),
            retrySchedule('sendUserOperation', Duration.seconds(10))
          );

          return txHash;
        });

        const result = await Effect.runPromise(Effect.either(publish));

        if (Either.isLeft(result)) {
          const err = result.left;

          // Roll back optimistic update
          queryClient.invalidateQueries({ queryKey: ['comments', targetEntityId] });

          if (err instanceof Error && err.message.includes('User rejected')) {
            return;
          }

          console.error('[useCreateComment] Edit failed:', err);
          setToast(<span>Failed to edit comment</span>);
          setError(err as Error);
          return;
        }

        setToast(<span>Comment updated!</span>);

        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['comments', targetEntityId] });
        }, 5000);
      } catch (err) {
        console.error('[useCreateComment] Error editing comment:', err);
        setToast(<span>Failed to edit comment</span>);
        setError(err as Error);
      } finally {
        setIsCreating(false);
      }
    },
    [smartAccount, personalSpaceId, targetEntityId, queryClient, setToast]
  );

  return {
    createComment,
    editComment,
    isCreating,
    error,
  };
}
