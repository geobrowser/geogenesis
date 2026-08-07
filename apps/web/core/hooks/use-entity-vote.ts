'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback, useSyncExternalStore } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { getUserEntityResponse } from '~/core/io/queries';
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

interface UseEntityResponseArgs {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind | null;
}

type PendingEntityResponseIndex = {
  entityId: string;
  expectedResponse: ActiveResponseDirection | null;
  personalSpaceId: string;
  responseKind: ResponseKind;
  spaceId: string;
};

type EntityResponseIndexingState =
  | { status: 'idle'; pending: null; runId: null }
  | { status: 'reconciling'; pending: PendingEntityResponseIndex | null; runId: string }
  | { status: 'delayed'; pending: PendingEntityResponseIndex; runId: string };

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
}: UseEntityResponseArgs): EntityResponseIndexingState['status'] {
  return useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind }).status;
}

function useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind }: UseEntityResponseArgs) {
  const queryClient = useQueryClient();
  const getSnapshot = useCallback(
    () =>
      queryClient.getQueryData<EntityResponseIndexingState>(
        entityResponseIndexingQueryKey(entityId, spaceId, responseKind)
      ) ?? IDLE_INDEXING_STATE,
    [entityId, queryClient, responseKind, spaceId]
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) => queryClient.getQueryCache().subscribe(onStoreChange),
    [queryClient]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useEntityResponse({ entityId, spaceId, responseKind }: UseEntityResponseArgs) {
  const queryClient = useQueryClient();
  const responseIndexingRegistry = getResponseIndexingRegistry(queryClient);
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const indexingQueryKey = entityResponseIndexingQueryKey(entityId, spaceId, responseKind);
  const indexingKeyId = JSON.stringify(indexingQueryKey);
  const indexingState = useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind });

  const tx = useSmartAccountTransaction();

  const isCurrentIndexingRun = useCallback(
    (runId: string) => queryClient.getQueryData<EntityResponseIndexingState>(indexingQueryKey)?.runId === runId,
    [indexingQueryKey, queryClient]
  );

  const invalidateResponseQueries = useCallback(
    (pending: PendingEntityResponseIndex) =>
      Promise.all([
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
      ]),
    [queryClient]
  );

  const reconcileResponseIndexing = useCallback(
    async (pending: PendingEntityResponseIndex, runId: string) => {
      if (!isCurrentIndexingRun(runId)) return;
      cancelActiveResponseReconciliation(responseIndexingRegistry, indexingKeyId);
      const controller = new AbortController();
      responseIndexingRegistry.activeReconciliations.set(indexingKeyId, { controller, runId });
      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
        status: 'reconciling',
        pending,
        runId,
      });

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

      await invalidateResponseQueries(pending);
      if (!isCurrentIndexingRun(runId)) return;

      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, IDLE_INDEXING_STATE);
      responseIndexingRegistry.submissionRuns.delete(indexingKeyId);
    },
    [
      indexingKeyId,
      indexingQueryKey,
      invalidateResponseQueries,
      isCurrentIndexingRun,
      queryClient,
      responseIndexingRegistry,
    ]
  );

  const executeResponse = useCallback(
    async (direction: ResponseDirection) => {
      if (!responseKind) {
        throw new Error('Response type is unavailable. Cannot submit response.');
      }

      if (!validateSpaceId(spaceId)) {
        throw new Error('Invalid space ID format. Cannot submit response.');
      }

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

      const expectedResponse = direction === 'clear' ? null : direction;
      const pending: PendingEntityResponseIndex = {
        entityId,
        expectedResponse,
        personalSpaceId,
        responseKind,
        spaceId,
      };
      return { pending, transaction: result.right };
    },
    [personalSpaceId, isRegistered, spaceId, entityId, responseKind, tx]
  );

  const responseMutation = useMutation({
    mutationFn: executeResponse,
    onMutate: () => {
      const previousState =
        queryClient.getQueryData<EntityResponseIndexingState>(indexingQueryKey) ?? IDLE_INDEXING_STATE;
      const { runId, runOrder } = createResponseIndexingRunId();
      getResponseSubmissionRuns(responseIndexingRegistry, indexingKeyId).set(runId, {
        pending: null,
        previousState,
        runId,
        runOrder,
        status: 'pending',
      });
      cancelActiveResponseReconciliation(responseIndexingRegistry, indexingKeyId);
      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
        status: 'reconciling',
        pending: null,
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
    if (!indexingState.pending || indexingState.status === 'reconciling') return;
    const { runId } = createResponseIndexingRunId();
    queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
      status: 'reconciling',
      pending: indexingState.pending,
      runId,
    });
    void reconcileResponseIndexing(indexingState.pending, runId);
  }, [indexingKeyId, indexingQueryKey, indexingState, queryClient, reconcileResponseIndexing]);

  return {
    submitResponse: responseMutation.mutate,
    isProcessingResponse: responseMutation.isPending || indexingState.status !== 'idle',
    isResponseIndexingDelayed: indexingState.status === 'delayed',
    retryResponseIndexing,
    isConnected: !!personalSpaceId && isRegistered,
    personalSpaceId,
  };
}
