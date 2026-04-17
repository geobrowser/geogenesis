'use client';

import { personalSpace } from '@geoprotocol/geo-sdk';
import { Graph, IdUtils, type Op } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { TransactionWriteFailedError } from '~/core/errors';
import { getSpace } from '~/core/io/queries';

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
    async ({ text, targetSpaceId, replyTo }: Omit<CreateCommentParams, 'targetEntityId'>) => {
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
        const space = await Effect.runPromise(getSpace(personalSpaceId));
        if (!space) {
          setToast(<span>Failed to resolve personal space</span>);
          setIsCreating(false);
          return;
        }

        const commentEntityId = IdUtils.generate();
        const commentName = getCommentName(text);

        const replyToTarget = replyTo ?? {
          entityId: targetEntityId,
          spaceId: targetSpaceId,
        };

        let ops: Op[];
        try {
          const result = await Graph.createComment({
            id: commentEntityId,
            content: text,
            replyTo: replyToTarget,
            resolved: false,
            network: 'TESTNET',
          });
          ops = result.ops;
        } catch (err) {
          console.error('[useCreateComment] Graph.createComment failed:', err);
          setToast(<span>Failed to create comment</span>);
          setError(err as Error);
          return;
        }

        const optimisticComment: CommentEntity = {
          id: commentEntityId,
          name: commentName,
          markdownContent: text,
          targetEntityId,
          targetSpaceId,
          replyToCommentId: replyTo?.entityId ?? null,
          replyToCommentSpaceId: replyTo?.spaceId ?? null,
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

        const publish = Effect.gen(function* () {
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

        const publishResult = await Effect.runPromise(Effect.either(publish));

        if (Either.isLeft(publishResult)) {
          const err = publishResult.left;

          queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
            old.filter(c => c.id !== commentEntityId)
          );

          if (err instanceof Error && err.message.includes('User rejected')) {
            return;
          }

          console.error('[useCreateComment] Publish failed:', err);
          setToast(<span>Failed to publish comment</span>);
          setError(err as Error);
          return;
        }

        setToast(<span>Comment published!</span>);

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

      if (commentSpaceId !== personalSpaceId) {
        setToast(<span>You can only edit your own comments</span>);
        return;
      }

      setIsCreating(true);
      setError(null);

      try {
        const newName = getCommentName(newText);
        const { ops } = Graph.updateComment({ id: commentId, content: newText });

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

        const publishResult = await Effect.runPromise(Effect.either(publish));

        if (Either.isLeft(publishResult)) {
          const err = publishResult.left;

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
