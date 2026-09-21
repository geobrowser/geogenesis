'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { ID } from '~/core/id';
import { type EntityResponder, getEntityResponders } from '~/core/io/queries';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  type ResponseObjectType,
  entityRespondersQueryKey,
} from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';

/**
 * One responder read and one optimistic-viewer overlay for every response UI.
 *
 * Claim avatar stacks, per-side stacks and claim-comment badges all describe the same population.
 * Sharing the query and overlay here keeps them on the same cache key, honors batched claim pages,
 * and prevents one surface from leaving the viewer on their stale indexed side while another moves.
 */
export function useEntityResponders({
  entityId,
  spaceId,
  objectType,
  responseKind,
  viewerSpaceId,
  optimisticViewerResponse,
}: {
  entityId: string;
  spaceId: string;
  objectType: ResponseObjectType;
  responseKind: ResponseKind;
  viewerSpaceId?: string | null;
  /** Undefined means no optimistic overlay; null explicitly removes the viewer's indexed response. */
  optimisticViewerResponse?: ActiveResponseDirection | null;
}) {
  const responseBatch = useClaimResponseBatchState();
  const query = useQuery({
    queryKey: entityRespondersQueryKey(entityId, spaceId, objectType, responseKind),
    queryFn: ({ signal }) =>
      Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, objectType, signal)),
    enabled: !responseBatch.managed,
    staleTime: 30_000,
  });

  const responders = React.useMemo(
    () => applyOptimisticViewerResponse(query.data ?? [], viewerSpaceId, optimisticViewerResponse),
    [optimisticViewerResponse, query.data, viewerSpaceId]
  );

  return { ...query, responders, queriesEnabled: !responseBatch.managed };
}

export function applyOptimisticViewerResponse(
  responders: EntityResponder[],
  viewerSpaceId?: string | null,
  optimisticViewerResponse?: ActiveResponseDirection | null
): EntityResponder[] {
  if (optimisticViewerResponse === undefined || !viewerSpaceId) return responders;

  const otherResponders = responders.filter(responder => !ID.equals(responder.userId, viewerSpaceId));
  return optimisticViewerResponse === null
    ? otherResponders
    : [{ userId: viewerSpaceId, direction: optimisticViewerResponse }, ...otherResponders];
}
