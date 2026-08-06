'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback, useRef, useSyncExternalStore } from 'react';

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
  | { status: 'idle'; pending: null }
  | { status: 'reconciling'; pending: PendingEntityResponseIndex | null }
  | { status: 'delayed'; pending: PendingEntityResponseIndex };

const IDLE_INDEXING_STATE: EntityResponseIndexingState = { status: 'idle', pending: null };

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
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const indexingQueryKey = entityResponseIndexingQueryKey(entityId, spaceId, responseKind);
  const indexingState = useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind });
  const reconciliationRun = useRef(0);

  const tx = useSmartAccountTransaction();

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
    async (pending: PendingEntityResponseIndex) => {
      const run = ++reconciliationRun.current;
      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
        status: 'reconciling',
        pending,
      });

      const indexed = await waitForIndexedEntityResponse(
        () =>
          Effect.runPromise(
            getUserEntityResponse(pending.personalSpaceId, pending.entityId, pending.spaceId, pending.responseKind)
          ),
        pending.expectedResponse
      );

      if (run !== reconciliationRun.current) return;

      if (!indexed) {
        queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
          status: 'delayed',
          pending,
        });
        return;
      }

      await invalidateResponseQueries(pending);
      if (run !== reconciliationRun.current) return;

      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, IDLE_INDEXING_STATE);
    },
    [indexingQueryKey, invalidateResponseQueries, queryClient]
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
      reconciliationRun.current += 1;
      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, {
        status: 'reconciling',
        pending: null,
      });
    },
    onSuccess: submission => {
      void reconcileResponseIndexing(submission.pending);
    },
    onError: () => {
      queryClient.setQueryData<EntityResponseIndexingState>(indexingQueryKey, IDLE_INDEXING_STATE);
    },
  });

  const retryResponseIndexing = useCallback(() => {
    if (!indexingState.pending || indexingState.status === 'reconciling') return;
    void reconcileResponseIndexing(indexingState.pending);
  }, [indexingState, reconcileResponseIndexing]);

  return {
    submitResponse: responseMutation.mutate,
    isProcessingResponse: responseMutation.isPending || indexingState.status !== 'idle',
    isResponseIndexingDelayed: indexingState.status === 'delayed',
    retryResponseIndexing,
    isConnected: !!personalSpaceId && isRegistered,
    personalSpaceId,
  };
}
