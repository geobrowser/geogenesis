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
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { TransactionWriteFailedError } from '~/core/errors';
import { createValueId } from '~/core/id/create-id';
import { getSpace } from '~/core/io/queries';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import type { Relation, Value } from '~/core/types';
import { Publish } from '~/core/utils/publish';

import type { CommentEntity, CreateCommentParams } from '~/partials/comments/types';

import { fetchCommentEntitiesForTarget, mergePendingWithServer } from './use-comments';

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

  // Aborts any in-flight post-publish pollers when the hook unmounts so we don't
  // keep issuing network requests or mutating the query cache for a stale page.
  const pollAbortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    return () => {
      pollAbortRef.current?.abort();
    };
  }, []);

  const createComment = React.useCallback(
    async ({ text, targetSpaceId, ancestorComments }: Omit<CreateCommentParams, 'targetEntityId'>) => {
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
        // Positions are ordered: target entity (lowest) → root ancestor → ... → immediate parent (highest)
        let lastReplyToPos: string | null = null;

        const targetEntityPosition = Position.generateBetween(lastReplyToPos, null);
        lastReplyToPos = targetEntityPosition;

        relations.push({
          id: IdUtils.generate(),
          entityId: IdUtils.generate(),
          spaceId: personalSpaceId,
          renderableType: 'RELATION',
          position: targetEntityPosition,
          type: { id: COMMENT_REPLY_TO_ID, name: 'Reply to' },
          fromEntity: { id: commentEntityId, name: commentName },
          toEntity: { id: targetEntityId, name: null, value: targetEntityId },
          toSpaceId: targetSpaceId,
          isLocal: true,
          hasBeenPublished: false,
        });

        // 6. Reply To relations for each ancestor comment in the thread
        // ancestorComments is [immediate parent, ..., root] — reverse so positions ascend from root to immediate parent
        if (ancestorComments) {
          const rootToLeaf = [...ancestorComments].reverse();
          for (const ancestor of rootToLeaf) {
            const pos = Position.generateBetween(lastReplyToPos, null);
            lastReplyToPos = pos;

            relations.push({
              id: IdUtils.generate(),
              entityId: IdUtils.generate(),
              spaceId: personalSpaceId,
              renderableType: 'RELATION',
              position: pos,
              type: { id: COMMENT_REPLY_TO_ID, name: 'Reply to' },
              fromEntity: { id: commentEntityId, name: commentName },
              toEntity: { id: ancestor.id, name: null, value: ancestor.id },
              toSpaceId: ancestor.spaceId,
              isLocal: true,
              hasBeenPublished: false,
            });
          }
        }

        // Fetch author info for optimistic update (match useComments profile + avatar rules)
        const [space, profile] = await Promise.all([
          Effect.runPromise(getSpace(personalSpaceId)),
          Effect.runPromise(
            fetchProfileBySpaceId(personalSpaceId, smartAccount.account.address as `0x${string}`)
          ),
        ]);
        if (!space) {
          setToast(<span>Failed to resolve personal space</span>);
          setIsCreating(false);
          return;
        }

        const avatarUrl =
          profile.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

        // Optimistically add comment to the query cache
        const optimisticComment: CommentEntity = {
          id: commentEntityId,
          name: commentName,
          markdownContent: text,
          targetEntityId,
          targetSpaceId,
          replyToCommentId: ancestorComments?.[0]?.id ?? null,
          replyToCommentSpaceId: ancestorComments?.[0]?.spaceId ?? null,
          author: {
            spaceId: personalSpaceId,
            address: profile.address,
            name: profile.name ?? space.entity.name ?? null,
            avatarUrl,
          },
          createdAt: new Date().toISOString(),
          spaceId: personalSpaceId,
          resolved: false,
          isPendingPublish: true,
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

        // Indexer may lag behind the chain; poll instead of invalidate so the optimistic row is not dropped.
        const FIRST_POLL_MS = 1500;
        const POLL_INTERVAL_MS = 2000;
        const MAX_POLL_ATTEMPTS = 45;

        // Each publish gets its own AbortController. Replacing the ref aborts any previous
        // poller still running from an earlier publish on this hook instance.
        pollAbortRef.current?.abort();
        const controller = new AbortController();
        pollAbortRef.current = controller;
        const { signal } = controller;

        const sleep = (ms: number) =>
          new Promise<void>((resolve, reject) => {
            if (signal.aborted) return reject(signal.reason);
            const t = setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              resolve();
            }, ms);
            const onAbort = () => {
              clearTimeout(t);
              reject(signal.reason);
            };
            signal.addEventListener('abort', onAbort, { once: true });
          });

        // Merge server results with any pending-publish rows already in the cache so concurrent
        // optimistic comments (including this one, until the indexer sees it) survive the update.
        const applyServerList = (list: CommentEntity[]) => {
          queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (prev?: CommentEntity[]) =>
            mergePendingWithServer(list, prev)
          );
        };

        void (async () => {
          try {
            await sleep(FIRST_POLL_MS);
            for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
              if (signal.aborted) return;
              try {
                const list = await fetchCommentEntitiesForTarget(targetEntityId, signal);
                if (list.some(c => c.id === commentEntityId)) {
                  applyServerList(list);
                  return;
                }
              } catch (e) {
                if (signal.aborted) return;
                console.error('[useCreateComment] Poll for indexed comment failed:', e);
              }
              await sleep(POLL_INTERVAL_MS);
            }
            if (signal.aborted) return;
            const list = await fetchCommentEntitiesForTarget(targetEntityId, signal);
            applyServerList(list);
          } catch (e) {
            if (!signal.aborted) {
              console.error('[useCreateComment] Final comment sync failed:', e);
            }
          } finally {
            if (pollAbortRef.current === controller) {
              pollAbortRef.current = null;
            }
          }
        })();
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
