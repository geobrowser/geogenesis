'use client';

import { hashKey, useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
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
    onSuccess: (submission, _direction, context) => {
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

  useEffect(() => {
    if (indexingState.status !== 'delayed') return;
    const retryTimer = window.setTimeout(retryResponseIndexing, 10_000);
    return () => window.clearTimeout(retryTimer);
  }, [indexingState.status, retryResponseIndexing]);

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
