'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { getUserEntityResponse } from '~/core/io/queries';
import {
  type ResponseDirection,
  type ResponseKind,
  entityResponderProfilesQueryKey,
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
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
  responseKind: ResponseKind;
}

export function useEntityResponse({ entityId, spaceId, responseKind }: UseEntityResponseArgs) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction();

  const submitResponse = useCallback(
    async (direction: ResponseDirection) => {
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

      await waitForIndexedEntityResponse(
        () =>
          Effect.runPromise(getUserEntityResponse(personalSpaceId, entityId, spaceId, responseKind)),
        direction === 'clear' ? null : direction
      );

      return result.right;
    },
    [personalSpaceId, isRegistered, spaceId, entityId, responseKind, tx]
  );

  const onSuccess = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: entityResponseCountsQueryKey(entityId, spaceId, 0, responseKind),
      }),
      queryClient.invalidateQueries({
        queryKey: userEntityResponseQueryKey(personalSpaceId, entityId, spaceId, 0, responseKind),
      }),
      queryClient.invalidateQueries({
        queryKey: entityRespondersQueryKey(entityId, spaceId, 0, responseKind),
      }),
      queryClient.invalidateQueries({
        queryKey: entityResponderProfilesQueryKey(entityId, spaceId, 0, responseKind),
      }),
    ]);

  const positiveResponse = useMutation({
    mutationFn: () => submitResponse('positive'),
    onSuccess,
  });

  const negativeResponse = useMutation({
    mutationFn: () => submitResponse('negative'),
    onSuccess,
  });

  const clearResponse = useMutation({
    mutationFn: () => submitResponse('clear'),
    onSuccess,
  });

  return {
    submitPositiveResponse: positiveResponse.mutate,
    submitNegativeResponse: negativeResponse.mutate,
    clearResponse: clearResponse.mutate,
    isProcessingResponse: positiveResponse.isPending || negativeResponse.isPending || clearResponse.isPending,
    isConnected: !!personalSpaceId && isRegistered,
    personalSpaceId,
  };
}
