'use client';

import { hashKey, useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { Effect, Either } from 'effect';

import { ensureSpaceMembership } from '~/core/access/request-space-membership';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import {
  EMPTY_PENDING_VOTED_OVERRIDES,
  type EntityVoteDirectionFilter,
  type PendingVotedOverrides,
  type UserVotedEntityIdsCache,
  clearPendingVotedEntity,
  removeEntityFromVotedIds,
  restorePendingVotedEntry,
  suppressVotedId,
  userEntityVotesQueryKey,
  votedEntityIdsPendingQueryKey,
} from '~/core/hooks/use-user-voted-entity-ids';
import { withRetryAfterJitter } from '~/core/io/errors/retry-utils';
import { getUserEntityResponse } from '~/core/io/queries';
import {
  claimResponseSummariesQueryKeyPrefix,
  loadClaimResponseSummaryCaches,
} from '~/core/responses/claim-response-summaries';
import {
  type ActiveResponseDirection,
  type ResponseDirection,
  type ResponseKind,
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  entityResponseIndexingQueryKey,
  getResponseActionMethod,
  responseKindToVoteKind,
  userEntityResponseQueryKey,
  waitForIndexedEntityResponse,
} from '~/core/responses/entity-response';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';

import { readCachedPersonalSpace, readCachedSmartAccount } from './cached-write-identity';

interface UseEntityResponseArgs {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind | null;
}

export type PendingEntityResponseIndex = {
  entityId: string;
  expectedResponse: ActiveResponseDirection | null;
  personalSpaceId: string;
  responseKind: ResponseKind;
  spaceId: string;
};

export type EntityResponseIndexingState =
  | { status: 'idle'; pending: null; runId: null }
  | { status: 'reconciling'; pending: PendingEntityResponseIndex | null; runId: string }
  | { status: 'delayed'; pending: PendingEntityResponseIndex; runId: string }
  | { status: 'indexed'; pending: PendingEntityResponseIndex; runId: string };

const IDLE_INDEXING_STATE: EntityResponseIndexingState = { status: 'idle', pending: null, runId: null };

/**
 * How long to wait before re-checking whether a submitted response has been indexed.
 *
 * This sits on the critical path of a *two-person* interaction, which is why it is a backoff and
 * not a flat interval. In the rematch picker, the opponent only learns about a position once this
 * client notices it is indexed and tells geo-chat (`useClaimResponseIndexedNotifier`), which then
 * emits `debate.claims_changed`. A flat 10s re-check therefore quantised the opponent's view to
 * 10s steps *on top of* the write, which measures p50 9.9s / p95 48.6s (`web.write.entity_response`
 * in Sentry, 200 samples over 7 days) — together landing on the 20-30s in GEO-2687.
 *
 * Starting at 1s catches the common case where indexing completes a second or two after the first
 * check, which the flat interval charged a full 10s for. The cap keeps a genuinely slow index from
 * turning into a tight poll, and the jitter stops two participants' clients — which submit at
 * nearly the same moment — from lining their retries up on the same instants.
 */
const RESPONSE_INDEXING_RETRY_BASE_MS = 1_000;
const RESPONSE_INDEXING_RETRY_MAX_MS = 10_000;

/**
 * The un-jittered delay before re-check number `attempt` (0-based). Exported and kept pure so the
 * shape of the backoff can be asserted directly, rather than inferred from fake-timer choreography.
 */
export function responseIndexingRetryDelayMs(attempt: number): number {
  const exponential = RESPONSE_INDEXING_RETRY_BASE_MS * 2 ** Math.max(0, attempt);
  return Math.min(exponential, RESPONSE_INDEXING_RETRY_MAX_MS);
}

let responseIndexingRunSequence = 0;
type ResponseSubmissionRun = {
  pending: PendingEntityResponseIndex | null;
  previousState: EntityResponseIndexingState;
  runId: string;
  runOrder: number;
  status: 'pending' | 'success' | 'failed';
};
type ResponseIndexingRegistry = {
  activeReconciliations: Map<string, { controller: AbortController; runId: string }>;
  submissionRuns: Map<string, Map<string, ResponseSubmissionRun>>;
};
const responseIndexingRegistries = new WeakMap<object, ResponseIndexingRegistry>();

function createResponseIndexingRunId() {
  responseIndexingRunSequence += 1;
  return {
    runId: `${Date.now()}-${responseIndexingRunSequence}`,
    runOrder: responseIndexingRunSequence,
  };
}

function getResponseIndexingRegistry(queryClient: object) {
  let registry = responseIndexingRegistries.get(queryClient);
  if (!registry) {
    registry = { activeReconciliations: new Map(), submissionRuns: new Map() };
    responseIndexingRegistries.set(queryClient, registry);
  }
  return registry;
}

function cancelActiveResponseReconciliation(registry: ResponseIndexingRegistry, indexingKeyId: string) {
  registry.activeReconciliations.get(indexingKeyId)?.controller.abort();
  registry.activeReconciliations.delete(indexingKeyId);
}

function getResponseSubmissionRuns(registry: ResponseIndexingRegistry, indexingKeyId: string) {
  let runs = registry.submissionRuns.get(indexingKeyId);
  if (!runs) {
    runs = new Map();
    registry.submissionRuns.set(indexingKeyId, runs);
  }
  return runs;
}

export function useEntityResponseIndexingState({
  entityId,
  spaceId,
  responseKind,
}: UseEntityResponseArgs): 'idle' | 'reconciling' | 'delayed' {
  const status = useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind }).status;
  return status === 'indexed' ? 'idle' : status;
}

export function useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind }: UseEntityResponseArgs) {
  const queryClient = useQueryClient();
  const { personalSpaceId } = usePersonalSpaceId();
  const queryKey = useMemo(
    () => entityResponseIndexingQueryKey(personalSpaceId, entityId, spaceId, responseKind),
    [entityId, personalSpaceId, responseKind, spaceId]
  );
  const queryHash = useMemo(() => hashKey(queryKey), [queryKey]);
  const getSnapshot = useCallback(
    () => queryClient.getQueryData<EntityResponseIndexingState>(queryKey) ?? IDLE_INDEXING_STATE,
    [queryClient, queryKey]
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      queryClient.getQueryCache().subscribe(event => {
        if (event.query.queryHash === queryHash) onStoreChange();
      }),
    [queryClient, queryHash]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useResetEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind }: UseEntityResponseArgs) {
  const queryClient = useQueryClient();
  const { personalSpaceId } = usePersonalSpaceId();
  const queryKey = useMemo(
    () => entityResponseIndexingQueryKey(personalSpaceId, entityId, spaceId, responseKind),
    [entityId, personalSpaceId, responseKind, spaceId]
  );

  return useCallback(
    (runId: string) => {
      queryClient.setQueryData<EntityResponseIndexingState>(queryKey, current =>
        current?.runId === runId ? IDLE_INDEXING_STATE : current
      );
    },
    [queryClient, queryKey]
  );
}

export function useEntityResponse({ entityId, spaceId, responseKind }: UseEntityResponseArgs) {
  const queryClient = useQueryClient();
  const responseIndexingRegistry = getResponseIndexingRegistry(queryClient);
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  // While mounted the reactive value is correct; a queued vote replayed after the button remounted
  const readRegisteredSpace = useCallback((): { personalSpaceId: string | null; isRegistered: boolean } => {
    if (personalSpaceId && isRegistered) return { personalSpaceId, isRegistered };
    const account = readCachedSmartAccount(queryClient, null);
    return readCachedPersonalSpace(queryClient, account?.account.address);
  }, [personalSpaceId, isRegistered, queryClient]);

  const indexingQueryKey = useMemo(
    () => entityResponseIndexingQueryKey(personalSpaceId, entityId, spaceId, responseKind),
    [entityId, personalSpaceId, responseKind, spaceId]
  );
  const indexingKeyId = useMemo(() => hashKey(indexingQueryKey), [indexingQueryKey]);
  const indexingState = useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind });

  const tx = useSmartAccountTransaction();

  const pendingResponseIndex = useCallback(
    (direction: ResponseDirection): PendingEntityResponseIndex | null => {
      const { personalSpaceId, isRegistered } = readRegisteredSpace();
      if (!responseKind || !personalSpaceId || !isRegistered || !validateSpaceId(spaceId)) return null;

      return {
        entityId,
        expectedResponse: direction === 'clear' ? null : direction,
        personalSpaceId,
        responseKind,
        spaceId,
      };
    },
    [entityId, readRegisteredSpace, responseKind, spaceId]
  );

  const isCurrentIndexingRun = useCallback(
    (runId: string) => queryClient.getQueryData<EntityResponseIndexingState>(indexingQueryKey)?.runId === runId,
    [indexingQueryKey, queryClient]
  );

  const reconcileResponseIndexing = useCallback(
    async (pending: PendingEntityResponseIndex, runId: string) => {
      if (!isCurrentIndexingRun(runId)) return;
      cancelActiveResponseReconciliation(responseIndexingRegistry, indexingKeyId);
      const controller = new AbortController();
      responseIndexingRegistry.activeReconciliations.set(indexingKeyId, { controller, runId });

      const indexed = await waitForIndexedEntityResponse(
        signal =>
          Effect.runPromise(
            getUserEntityResponse(
              pending.personalSpaceId,
              pending.entityId,
              pending.spaceId,
              pending.responseKind,
              0,
              signal
            )
          ),
        pending.expectedResponse,
        30,
        2_000,
        5_000,
        controller.signal
      );

      const activeReconciliation = responseIndexingRegistry.activeReconciliations.get(indexingKeyId);
      if (activeReconciliation?.controller !== controller) return;
      responseIndexingRegistry.activeReconciliations.delete(indexingKeyId);

      if (!isCurrentIndexingRun(runId)) return;

      if (!indexed) {
        queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
          status: 'delayed',
          pending,
          runId,
        });
        responseIndexingRegistry.submissionRuns.delete(indexingKeyId);
        return;
      }

      try {
        if (pending.responseKind === 'curation') {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: entityResponseCountsQueryKey(pending.entityId, pending.spaceId, 0, pending.responseKind),
            }),
            queryClient.invalidateQueries({
              queryKey: userEntityResponseQueryKey(
                pending.personalSpaceId,
                pending.entityId,
                pending.spaceId,
                0,
                pending.responseKind
              ),
            }),
            queryClient.invalidateQueries({
              queryKey: entityRespondersQueryKey(pending.entityId, pending.spaceId, 0, pending.responseKind),
            }),
          ]);
        } else {
          void queryClient.cancelQueries({
            queryKey: claimResponseSummariesQueryKeyPrefix(pending.personalSpaceId, pending.spaceId),
          });
          await loadClaimResponseSummaryCaches({
            queryClient,
            spaceId: pending.spaceId,
            targets: [{ entityId: pending.entityId, responseKind: pending.responseKind }],
            personalSpaceId: pending.personalSpaceId,
            signal: controller.signal,
            forceResponseRefresh: true,
          });
        }
      } catch {
        if (!isCurrentIndexingRun(runId)) return;
        queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
          status: 'delayed',
          pending,
          runId,
        });
        responseIndexingRegistry.submissionRuns.delete(indexingKeyId);
        return;
      }
      if (!isCurrentIndexingRun(runId)) return;

      // The vote is indexed, so the server lists can finally see it. Refetch them
      // before dropping the optimistic override, or the row would blink out of the
      // tab in the gap between the two.
      try {
        await Promise.all(
          (['up', 'down'] as const).map(listDirection =>
            queryClient.invalidateQueries({
              queryKey: userEntityVotesQueryKey(pending.personalSpaceId, listDirection),
            })
          )
        );
        for (const listDirection of ['up', 'down'] as const) {
          queryClient.setQueryData<PendingVotedOverrides>(
            votedEntityIdsPendingQueryKey(pending.personalSpaceId, listDirection),
            (current = EMPTY_PENDING_VOTED_OVERRIDES) => clearPendingVotedEntity(current, pending.entityId)
          );
        }
      } catch {
        // The response itself is indexed, so this run is still a success — keep the
        // override until a later refetch of the list picks the vote up and dedupes it.
      }

      if (!isCurrentIndexingRun(runId)) return;

      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
        status: 'indexed',
        pending,
        runId,
      });
      responseIndexingRegistry.submissionRuns.delete(indexingKeyId);
    },
    [indexingKeyId, indexingQueryKey, isCurrentIndexingRun, queryClient, responseIndexingRegistry]
  );

  const executeResponse = useCallback(
    async (direction: ResponseDirection) => {
      if (!responseKind) {
        throw new Error('Response type is unavailable. Cannot submit response.');
      }

      if (!validateSpaceId(spaceId)) {
        throw new Error('Invalid space ID format. Cannot submit response.');
      }

      const { personalSpaceId, isRegistered } = readRegisteredSpace();
      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to respond');
      }

      const params = {
        authorSpaceId: personalSpaceId,
        spaceId,
        entityId,
      };

      const action = getResponseActionMethod(responseKind, direction);
      const { to, calldata } = geo.responses[action](params);

      const txEffect = tx({ to, data: calldata }).pipe(
        Effect.withSpan('web.write.entity_response'),
        Effect.annotateSpans({
          'io.operation': 'entity_response',
          'response.kind': responseKind,
          'response.direction': direction,
          'response.objectType': '0',
        })
      );
      const result = await runEffectEither(txEffect);

      if (Either.isLeft(result)) {
        const error = result.left;
        console.error(
          `Entity response failed: ${error.message}`,
          { authorSpaceId: personalSpaceId, spaceId, entityId, responseKind, direction },
          error
        );
        throw error;
      }

      const pending = pendingResponseIndex(direction);
      if (!pending) throw new Error('Response indexing context is unavailable.');
      return { pending, transaction: result.right };
    },
    [readRegisteredSpace, spaceId, entityId, responseKind, tx, pendingResponseIndex]
  );

  const dropFromVotedList = (listPersonalSpaceId: string, direction: EntityVoteDirectionFilter) => {
    queryClient.setQueryData<UserVotedEntityIdsCache>(
      userEntityVotesQueryKey(listPersonalSpaceId, direction),
      current => removeEntityFromVotedIds(current, entityId)
    );
    queryClient.setQueryData<PendingVotedOverrides>(
      votedEntityIdsPendingQueryKey(listPersonalSpaceId, direction),
      (current = EMPTY_PENDING_VOTED_OVERRIDES) => suppressVotedId(current, entityId)
    );
  };

  const restoreToVotedList = (listPersonalSpaceId: string, direction: EntityVoteDirectionFilter, voteKind: number) => {
    // Optimistic: the indexer hasn't recorded this vote yet, so refetching the
    // list here would only bring back the state from before it. The override
    // carries the tab until reconciliation confirms indexing and clears it.
    queryClient.setQueryData<PendingVotedOverrides>(
      votedEntityIdsPendingQueryKey(listPersonalSpaceId, direction),
      (current = EMPTY_PENDING_VOTED_OVERRIDES) =>
        restorePendingVotedEntry(current, { entityId, voteKind, votedAt: new Date().toISOString() })
    );
  };

  /**
   * Keeps the Upvoted/Downvoted tabs in step with the response that just landed:
   * drop the entity from whichever list it no longer belongs to, restore it to the
   * one it just joined.
   * The response counts and the viewer's own response are invalidated by the
   * indexing reconciliation above rather than here.
   */
  const syncVotedLists = (direction: ResponseDirection, pending: PendingEntityResponseIndex) => {
    // The reactive personalSpaceId can still be null when a queued vote replays
    // after a remount, so key the lists off the space the response actually used.
    const listPersonalSpaceId = pending.personalSpaceId;

    if (direction !== 'positive') dropFromVotedList(listPersonalSpaceId, 'up');
    if (direction !== 'negative') dropFromVotedList(listPersonalSpaceId, 'down');

    if (direction !== 'clear') {
      restoreToVotedList(
        listPersonalSpaceId,
        direction === 'positive' ? 'up' : 'down',
        responseKindToVoteKind(pending.responseKind)
      );
    }
  };

  const responseMutation = useMutation({
    mutationFn: executeResponse,
    onMutate: direction => {
      const previousState =
        queryClient.getQueryData<EntityResponseIndexingState>(indexingQueryKey) ?? IDLE_INDEXING_STATE;
      const { runId, runOrder } = createResponseIndexingRunId();
      const pending = pendingResponseIndex(direction);
      getResponseSubmissionRuns(responseIndexingRegistry, indexingKeyId).set(runId, {
        pending,
        previousState,
        runId,
        runOrder,
        status: 'pending',
      });
      cancelActiveResponseReconciliation(responseIndexingRegistry, indexingKeyId);
      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
        status: 'reconciling',
        pending,
        runId,
      });
      return { previousState, runId, runOrder };
    },
    onSuccess: (submission, direction, context) => {
      syncVotedLists(direction, submission.pending);
      // Taking a position on a claim (agree/disagree, verify/dispute) says the user wants to
      // take part in the space the claim is published in, so join them to it the same way
      // submitting a ranking does. Curation upvotes are excluded — those apply to every
      // entity on every surface, and auto-joining on them would flood spaces with membership
      // proposals. Withdrawing a position isn't participation either.
      //
      // Fired once the response transaction has landed so the two user operations never race
      // for the same smart-account nonce.
      if (direction !== 'clear' && submission.pending.responseKind !== 'curation') {
        void ensureSpaceMembership({
          spaceId: submission.pending.spaceId,
          personalSpaceId: submission.pending.personalSpaceId,
          tx,
          queryClient,
        });
      }

      if (!context) return;
      const run = responseIndexingRegistry.submissionRuns.get(indexingKeyId)?.get(context.runId);
      if (!run) return;
      run.pending = submission.pending;
      run.status = 'success';
      if (isCurrentIndexingRun(context.runId)) {
        void reconcileResponseIndexing(submission.pending, context.runId);
      }
    },
    onError: (_error, _direction, context) => {
      if (!context) return;
      const runs = responseIndexingRegistry.submissionRuns.get(indexingKeyId);
      const failedRun = runs?.get(context.runId);
      if (!runs || !failedRun) return;
      failedRun.status = 'failed';
      if (!isCurrentIndexingRun(context.runId)) return;

      const recoverableRun = [...runs.values()]
        .filter(run => run.status !== 'failed' && run.runOrder < context.runOrder)
        .sort((left, right) => right.runOrder - left.runOrder)[0];
      if (recoverableRun) {
        queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
          status: 'reconciling',
          pending: recoverableRun.pending,
          runId: recoverableRun.runId,
        });
        if (recoverableRun.status === 'success' && recoverableRun.pending) {
          void reconcileResponseIndexing(recoverableRun.pending, recoverableRun.runId);
        }
        return;
      }

      const previousState = [...runs.values()].sort((left, right) => left.runOrder - right.runOrder)[0]?.previousState;
      responseIndexingRegistry.submissionRuns.delete(indexingKeyId);
      if (!previousState || previousState.status === 'idle') {
        queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, IDLE_INDEXING_STATE);
        return;
      }
      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, previousState);
      if (previousState.status === 'reconciling' && previousState.pending) {
        void reconcileResponseIndexing(previousState.pending, previousState.runId);
      }
    },
  });

  const retryResponseIndexing = useCallback(() => {
    const current = queryClient.getQueryData<EntityResponseIndexingState>(indexingQueryKey);
    if (!current?.pending || current.status !== 'delayed') return;
    const { runId } = current;
    queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
      status: 'reconciling',
      pending: current.pending,
      runId,
    });
    void reconcileResponseIndexing(current.pending, runId);
  }, [indexingQueryKey, queryClient, reconcileResponseIndexing]);

  // Counted per run so a new response starts its backoff from the beginning rather than inheriting
  // the tail of the previous one. A ref rather than state: this must survive the
  // delayed -> reconciling -> delayed cycling that re-runs the effect below, without itself
  // causing a render.
  const retryAttemptRef = useRef<{ runId: string | null; attempts: number }>({ runId: null, attempts: 0 });

  useEffect(() => {
    if (indexingState.status !== 'delayed') return;

    const { runId } = indexingState;
    if (retryAttemptRef.current.runId !== runId) {
      retryAttemptRef.current = { runId, attempts: 0 };
    }
    const attempt = retryAttemptRef.current.attempts;
    retryAttemptRef.current.attempts = attempt + 1;

    const retryTimer = window.setTimeout(
      retryResponseIndexing,
      withRetryAfterJitter(responseIndexingRetryDelayMs(attempt))
    );
    return () => window.clearTimeout(retryTimer);
    // `runId` is a dependency so a second response submitted while the first is still delayed
    // reschedules against its own attempt count instead of the previous run's.
  }, [indexingState.status, indexingState.runId, retryResponseIndexing]);

  const optimisticResponse =
    (indexingState.status !== 'reconciling' && indexingState.status !== 'delayed') || !indexingState.pending
      ? undefined
      : indexingState.pending.expectedResponse;

  return {
    submitResponse: responseMutation.mutate,
    submitResponseAsync: responseMutation.mutateAsync,
    optimisticResponse,
    isProcessingResponse:
      responseMutation.isPending || indexingState.status === 'reconciling' || indexingState.status === 'delayed',
    isResponseIndexingDelayed: indexingState.status === 'delayed',
    isConnected: !!personalSpaceId && isRegistered,
    personalSpaceId,
  };
}
