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
import { checkEntityExists } from '~/core/io/queries';
import type { Relation, Value } from '~/core/types';
import { Publish } from '~/core/utils/publish';

import type { CommentEntity, CreateCommentParams } from '~/partials/comments/types';

import { fetchCommentEntitiesForTarget, mergePendingWithServer } from './use-comments';

import { useGeoProfile } from './use-geo-profile';
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

  // Serializes the actual IPFS-upload + userOp-send portion of publishes. Rapid-fire
  // comments would otherwise contend over the smart account's nonce (the second userOp
  // hits the bundler before the first is mined and gets rejected). Each new publish awaits
  // the tail of this chain before running its own Effect; the optimistic "Publishing…"
  // row appears immediately regardless, so the queued comment is still visible to the user.
  const publishQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());

  // Reuse the navbar's cached profile fetch. useGeoProfile runs on every page (powers the
  // avatar in the top-right), so by the time the user clicks Comment the profile is already
  // in React Query's cache — no extra request.
  const walletAddress = smartAccount?.account.address ?? null;
  const { profile: cachedProfile } = useGeoProfile(walletAddress ?? undefined);

  const createComment = React.useCallback(
    async ({
      text,
      targetSpaceId,
      ancestorComments,
      onOptimistic,
    }: Omit<CreateCommentParams, 'targetEntityId'> & {
      /** Called once the optimistic row has been inserted into the cache, with its id. */
      onOptimistic?: (commentId: string) => void;
    }): Promise<string | null> => {
      if (!smartAccount) {
        setToast(<span>Please connect your wallet to comment</span>);
        return null;
      }

      if (!personalSpaceId) {
        setToast(<span>Personal space required to comment. Please complete onboarding.</span>);
        return null;
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

        // Insert the optimistic row SYNCHRONOUSLY — before any await — so it appears in the
        // same render as the input box closing. If we have cached author info (the common
        // case on any comment after the first), the row renders fully resolved immediately.
        // Otherwise we use the wallet address as the jazzicon seed and patch in name +
        // avatar once useGeoProfile resolves (it's shared with the navbar, so on any page load
        // after the first it's already cached).
        const walletAddr = smartAccount.account.address;
        const profileAvatarUrl =
          cachedProfile?.avatarUrl && cachedProfile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE
            ? cachedProfile.avatarUrl
            : null;
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
            address: cachedProfile?.address ?? walletAddr,
            name: cachedProfile?.name ?? null,
            avatarUrl: profileAvatarUrl,
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

        onOptimistic?.(commentEntityId);

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
                  spaceId: personalSpaceId,
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

        // Wait for any previous publish on this hook to finish before running our own Effect so
        // back-to-back comments don't contend for the smart account's nonce. The optimistic row
        // above has already been inserted, so the user sees "Publishing…" the entire time.
        const previousPublish = publishQueueRef.current;
        const thisPublish = previousPublish
          .catch(() => undefined)
          .then(() => Effect.runPromise(Effect.either(publish)));
        publishQueueRef.current = thisPublish.catch(() => undefined);
        const result = await thisPublish;

        if (Either.isLeft(result)) {
          const err = result.left;

          // Roll back the optimistic row since publish failed.
          queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
            old.filter(c => c.id !== commentEntityId)
          );

          // Handle user rejection silently
          if (err instanceof Error && err.message.includes('User rejected')) {
            return null;
          }

          console.error('[useCreateComment] Publish failed:', err);
          setToast(<span>Failed to publish comment</span>);
          setError(err as Error);
          return null;
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
            // Probe the cheap `entity(id) { id }` endpoint each tick instead of refetching the
            // whole comment list. Once the indexer has our comment, do a single full fetch and
            // merge. This cuts the poll cost from ~2 GraphQL calls + profile hydration per tick
            // to a ~1kb existence check.
            for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
              if (signal.aborted) return;
              try {
                const exists = await Effect.runPromise(
                  checkEntityExists(commentEntityId, signal)
                );
                if (exists) {
                  const list = await fetchCommentEntitiesForTarget(targetEntityId, signal);
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
            // Final catch-all: one full fetch even if the probe kept returning false, so a
            // flaky indexer or edge case doesn't leave the row stuck in "Publishing…" forever.
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

        return commentEntityId;
      } catch (err) {
        console.error('[useCreateComment] Error creating comment:', err);
        setToast(<span>Failed to create comment</span>);
        setError(err as Error);
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [smartAccount, personalSpaceId, targetEntityId, queryClient, setToast]
  );

  const editComment = React.useCallback(
    async ({
      commentId,
      commentSpaceId,
      newText,
    }: {
      commentId: string;
      commentSpaceId: string;
      newText: string;
    }): Promise<boolean> => {
      if (!smartAccount) {
        setToast(<span>Please connect your wallet to edit</span>);
        return false;
      }

      if (!personalSpaceId) {
        setToast(<span>Personal space required. Please complete onboarding.</span>);
        return false;
      }

      // Can only edit your own comments (published to your personal space)
      if (commentSpaceId !== personalSpaceId) {
        setToast(<span>You can only edit your own comments</span>);
        return false;
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
                  spaceId: personalSpaceId,
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
            return false;
          }

          console.error('[useCreateComment] Edit failed:', err);
          setToast(<span>Failed to edit comment</span>);
          setError(err as Error);
          return false;
        }

        setToast(<span>Comment updated!</span>);

        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['comments', targetEntityId] });
        }, 5000);

        return true;
      } catch (err) {
        console.error('[useCreateComment] Error editing comment:', err);
        setToast(<span>Failed to edit comment</span>);
        setError(err as Error);
        return false;
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
