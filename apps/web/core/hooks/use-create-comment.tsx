'use client';

import { isRevertedUserOperationError } from '@geogenesis/auth/account';
import { IdUtils, Ops, type Op } from '@geoprotocol/geo-sdk/lite';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { TransactionWriteFailedError } from '~/core/errors';
import { checkEntityExists } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { useReportError } from '~/core/state/status-bar-store';
import { toUserFacingError } from '~/core/utils/error-diagnostics';

import type { CommentEntity, CreateCommentParams } from '~/partials/comments/types';

import { readCachedPersonalSpace, readCachedSmartAccount } from './cached-write-identity';
import { fetchCommentEntitiesForTarget, mergePendingWithServer } from './use-comments';
import { useGeoProfile } from './use-geo-profile';
import { usePersonalSpaceId } from './use-personal-space-id';
import { useSmartAccount } from './use-smart-account';
import { useToast } from './use-toast';

type CreateCommentResult = { id: string; published: boolean };

/** Generate a short name from the first ~20 chars of markdown text, stripping formatting. */
function getCommentName(markdown: string): string {
  const plain = markdown
    .replace(/[#*_~`>\[\]()!]/g, '')
    .replace(/\n/g, ' ')
    .trim();
  if (plain.length <= 20) return plain || 'Comment';
  return plain.slice(0, 20).trimEnd() + '...';
}

// A reverted UserOperation short-circuits the schedule: it was included and had
// no effect, so re-sending the identical calldata reverts identically and only
// burns more sponsored operations.
function retrySchedule(label: string, maxDuration: Duration.DurationInput) {
  return Schedule.exponential('100 millis').pipe(
    Schedule.jittered,
    Schedule.compose(Schedule.elapsed),
    Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.decode(maxDuration))),
    Schedule.whileInput((error: unknown) => !isRevertedUserOperationError(error))
  );
}

export function useCreateComment(targetEntityId: string) {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId } = usePersonalSpaceId();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();
  const reportError = useReportError();

  // Counter (not boolean) because several publishes can be in flight at once — rapid submits,
  // or concurrent create + edit. A plain boolean would flip false when the first finally runs
  // even if later ones are still queued. `isCreating` is derived as `count > 0`.
  const [inFlightCount, setInFlightCount] = React.useState(0);
  const isCreating = inFlightCount > 0;
  const [error, setError] = React.useState<Error | null>(null);

  // Track every active post-publish poller's AbortController so unmount can abort them all.
  // Using a Set (not a single ref) so a new publish doesn't cancel an earlier publish's poller
  // and orphan its optimistic row in the "Publishing…"-then-never-reconciled state.
  const pollersRef = React.useRef<Set<AbortController>>(new Set());
  React.useEffect(() => {
    const pollers = pollersRef.current;
    return () => {
      for (const c of pollers) c.abort();
      pollers.clear();
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
  // in React Query's cache — no extra request. Stored in a ref so createComment can read the
  // latest value without being re-created when the profile eventually loads (otherwise the
  // memoized callback would close over a stale null profile until some other dep changed).
  const walletAddress = smartAccount?.account.address ?? null;
  const { profile: cachedProfile } = useGeoProfile(walletAddress ?? undefined);
  const cachedProfileRef = React.useRef(cachedProfile);
  React.useEffect(() => {
    cachedProfileRef.current = cachedProfile;
  }, [cachedProfile]);

  // Cold-load case: the user submits a comment before useGeoProfile has finished loading.
  // The optimistic row gets inserted with the wallet address as the jazzicon seed and null
  // name/avatar. Once the profile resolves, patch any of our still-pending rows in the cache
  // so they render with the real name + avatar instead of staying Anonymous until the
  // indexer takes over.
  React.useEffect(() => {
    if (!cachedProfile) return;
    const pendingSpaceId = walletAddress ? `pending:${walletAddress}` : null;
    const avatarUrl =
      cachedProfile.avatarUrl && cachedProfile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? cachedProfile.avatarUrl : null;
    queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], old => {
      if (!old) return old;
      let changed = false;
      const next = old.map(c => {
        if (!c.isPendingPublish) return c;
        const isOurs =
          (personalSpaceId != null && c.author.spaceId === personalSpaceId) ||
          (pendingSpaceId != null && c.author.spaceId === pendingSpaceId);
        if (!isOurs) return c;
        const nextSpaceId = personalSpaceId ?? c.author.spaceId;
        if (
          c.author.name === cachedProfile.name &&
          c.author.avatarUrl === avatarUrl &&
          c.author.spaceId === nextSpaceId
        ) {
          return c;
        }
        changed = true;
        return {
          ...c,
          spaceId: personalSpaceId ?? c.spaceId,
          author: {
            spaceId: nextSpaceId,
            address: cachedProfile.address,
            name: cachedProfile.name,
            avatarUrl,
          },
        };
      });
      return changed ? next : old;
    });
  }, [cachedProfile, personalSpaceId, queryClient, targetEntityId, walletAddress]);

  const createComment = React.useCallback(
    async ({
      text,
      targetSpaceId,
      ancestorComments,
      onOptimistic,
      commentId: existingCommentId,
    }: Omit<CreateCommentParams, 'targetEntityId'> & {
      /** Called once the optimistic row has been inserted into the cache, with its id. */
      onOptimistic?: (commentId: string) => void;
      commentId?: string;
    }): Promise<CreateCommentResult | null> => {
      const account = readCachedSmartAccount(queryClient, smartAccount);
      if (!account) {
        setToast(<span>Please connect your wallet to comment</span>);
        return null;
      }

      const { personalSpaceId } = readCachedPersonalSpace(queryClient, account.account.address);
      const commentEntityId = existingCommentId ?? IdUtils.generate();
      const commentName = getCommentName(text);
      const walletAddr = account.account.address;

      if (!existingCommentId) {
        const profileSnapshot = cachedProfileRef.current;
        const profileAvatarUrl =
          profileSnapshot?.avatarUrl && profileSnapshot.avatarUrl !== PLACEHOLDER_SPACE_IMAGE
            ? profileSnapshot.avatarUrl
            : null;
        const displaySpaceId = personalSpaceId ?? `pending:${walletAddr}`;
        const optimisticComment: CommentEntity = {
          id: commentEntityId,
          name: commentName,
          markdownContent: text,
          targetEntityId,
          targetSpaceId,
          replyToCommentId: ancestorComments?.[0]?.id ?? null,
          replyToCommentSpaceId: ancestorComments?.[0]?.spaceId ?? null,
          author: {
            spaceId: displaySpaceId,
            address: profileSnapshot?.address ?? walletAddr,
            name: profileSnapshot?.name ?? null,
            avatarUrl: profileAvatarUrl,
          },
          createdAt: new Date().toISOString(),
          spaceId: displaySpaceId,
          resolved: false,
          isPublishing: true,
          isPendingPublish: true,
        };

        queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) => [
          ...old,
          optimisticComment,
        ]);

        onOptimistic?.(commentEntityId);
      }

      if (!personalSpaceId) {
        return { id: commentEntityId, published: false };
      }

      if (existingCommentId) {
        queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
          old.map(c =>
            c.id === commentEntityId
              ? {
                  ...c,
                  spaceId: personalSpaceId,
                  author: { ...c.author, spaceId: personalSpaceId },
                  isPublishing: true,
                }
              : c
          )
        );
      }

      setInFlightCount(c => c + 1);
      setError(null);

      try {
        // `ancestorComments` is ordered [immediate parent, ..., root comment] and contains only
        // comments — never the entity being commented on. Index 0 is the direct reply target;
        // for a top-level comment there is no parent, so we reply straight to the target entity.
        const immediateParent = ancestorComments?.[0];
        const replyToTarget = immediateParent
          ? { entityId: immediateParent.id, spaceId: immediateParent.spaceId }
          : { entityId: targetEntityId, spaceId: targetSpaceId };
        const replyToRelations = immediateParent
          ? [
              ...ancestorComments!.slice(1).map(c => ({ entityId: c.id, spaceId: c.spaceId, position: null })),
              { entityId: targetEntityId, spaceId: targetSpaceId, position: null },
            ]
          : [];

        let ops: Op[];
        try {
          const result = Ops.comments.create({
            id: commentEntityId,
            content: text,
            replyTo: replyToTarget,
            resolved: false,
            replyToRelations,
          });
          ops = result.ops;
        } catch (err) {
          console.error('[useCreateComment] Ops.comments.create failed:', err);
          // Roll back the optimistic row since we never produced ops to publish.
          queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
            old.filter(c => c.id !== commentEntityId)
          );
          const { message, retry } = toUserFacingError(err, 'Failed to create comment: ');
          reportError(message, retry);
          setError(err as Error);
          return null;
        }

        const publish = Effect.gen(function* () {
          if (ops.length === 0) {
            throw new Error('No operations to publish');
          }

          const result = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                geo.personalSpaces.publishEdit({
                  name: `Comment: ${commentName}`,
                  spaceId: personalSpaceId,
                  ops,
                  author: personalSpaceId,
                }),
              catch: error => new TransactionWriteFailedError('IPFS upload failed', { cause: error }),
            }),
            retrySchedule('publishEdit', Duration.minutes(1))
          );

          const txHash = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                account.sendUserOperation({
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
          const { message, retry } = toUserFacingError(err, 'Failed to publish comment: ');
          reportError(message, retry);
          setError(err as Error);
          return null;
        }

        setToast(<span>Comment published!</span>);

        // Clear the "Publishing…" tag at the same moment the success toast appears. isPendingPublish
        // stays set so mergePendingWithServer continues preserving the optimistic row across cache
        // refetches until the indexer returns it; that's a separate concern from the UI tag.
        queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
          old.map(c => (c.id === commentEntityId ? { ...c, isPublishing: false } : c))
        );

        // Indexer may lag behind the chain; poll instead of invalidate so the optimistic row is not dropped.
        const FIRST_POLL_MS = 1500;
        const POLL_INTERVAL_MS = 2000;
        const MAX_POLL_ATTEMPTS = 45;

        // Each publish gets its own AbortController, tracked in a Set so concurrent pollers
        // coexist (a newer publish must not cancel an older publish's still-reconciling poller).
        // The hook's unmount cleanup aborts every controller in the Set.
        const controller = new AbortController();
        pollersRef.current.add(controller);
        const { signal } = controller;

        const sleep = (ms: number) =>
          new Promise<void>((resolve, reject) => {
            if (signal.aborted) {
              reject(signal.reason);
              return;
            }
            const t = setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              resolve();
            }, ms);
            const onAbort = () => {
              clearTimeout(t);
              reject(signal.reason);
            };
            signal.addEventListener('abort', onAbort, { once: true });
            // Close the window between the initial aborted-check and addEventListener:
            // if an abort fired during setup, invoke the handler directly so we don't
            // wait for the timer to run out.
            if (signal.aborted) onAbort();
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
                const exists = await Effect.runPromise(checkEntityExists(commentEntityId, signal));
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
            pollersRef.current.delete(controller);
          }
        })();

        return { id: commentEntityId, published: true };
      } catch (err) {
        console.error('[useCreateComment] Error creating comment:', err);
        const { message, retry } = toUserFacingError(err, 'Failed to create comment: ');
        reportError(message, retry);
        setError(err as Error);
        return null;
      } finally {
        setInFlightCount(c => c - 1);
      }
    },
    [smartAccount, targetEntityId, queryClient, setToast, reportError]
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
      const account = readCachedSmartAccount(queryClient, smartAccount);
      if (!account) {
        setToast(<span>Please connect your wallet to edit</span>);
        return false;
      }

      const { personalSpaceId } = readCachedPersonalSpace(queryClient, account.account.address);

      if (!personalSpaceId) {
        setToast(<span>Personal space required. Please complete onboarding.</span>);
        return false;
      }

      // Can only edit your own comments (published to your personal space)
      if (commentSpaceId !== personalSpaceId) {
        setToast(<span>You can only edit your own comments</span>);
        return false;
      }

      setInFlightCount(c => c + 1);
      setError(null);

      try {
        const newName = getCommentName(newText);
        // Generate the update ops through the SDK instead of hand-building values.
        const { ops } = Ops.comments.update({ id: commentId, content: newText });

        // Optimistically update the comment in the query cache
        queryClient.setQueryData<CommentEntity[]>(['comments', targetEntityId], (old = []) =>
          old.map(c => (c.id === commentId ? { ...c, markdownContent: newText, name: newName } : c))
        );

        const publish = Effect.gen(function* () {
          if (ops.length === 0) {
            throw new Error('No operations to publish');
          }

          const result = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                geo.personalSpaces.publishEdit({
                  name: `Edit comment: ${newName}`,
                  spaceId: personalSpaceId,
                  ops,
                  author: personalSpaceId,
                }),
              catch: error => new TransactionWriteFailedError('IPFS upload failed', { cause: error }),
            }),
            retrySchedule('publishEdit', Duration.minutes(1))
          );

          const txHash = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                account.sendUserOperation({
                  calls: [{ to: result.to, value: 0n, data: result.calldata }],
                }),
              catch: error => new TransactionWriteFailedError('Transaction failed', { cause: error }),
            }),
            retrySchedule('sendUserOperation', Duration.seconds(10))
          );

          return txHash;
        });

        // Route through the same queue as createComment so edit + create userOps don't
        // contend for the smart account's nonce.
        const previousPublish = publishQueueRef.current;
        const thisPublish = previousPublish
          .catch(() => undefined)
          .then(() => Effect.runPromise(Effect.either(publish)));
        publishQueueRef.current = thisPublish.catch(() => undefined);
        const result = await thisPublish;

        if (Either.isLeft(result)) {
          const err = result.left;

          // Roll back optimistic update
          queryClient.invalidateQueries({ queryKey: ['comments', targetEntityId] });

          if (err instanceof Error && err.message.includes('User rejected')) {
            return false;
          }

          console.error('[useCreateComment] Edit failed:', err);
          const { message, retry } = toUserFacingError(err, 'Failed to edit comment: ');
          reportError(message, retry);
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
        const { message, retry } = toUserFacingError(err, 'Failed to edit comment: ');
        reportError(message, retry);
        setError(err as Error);
        return false;
      } finally {
        setInFlightCount(c => c - 1);
      }
    },
    [smartAccount, targetEntityId, queryClient, setToast, reportError]
  );

  return {
    createComment,
    editComment,
    isCreating,
    error,
  };
}
