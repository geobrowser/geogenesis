'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getEntityResponders } from '~/core/io/queries';
import { type ResponseKind, type ResponseObjectType, entityRespondersQueryKey } from '~/core/responses/entity-response';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

export function ClaimResponderAvatars({
  entityId,
  spaceId,
  objectType,
  responseKind,
  totalResponders,
}: {
  entityId: string;
  spaceId: string;
  objectType: ResponseObjectType;
  responseKind: ResponseKind;
  totalResponders: number;
}) {
  const { data: responders } = useQuery({
    queryKey: entityRespondersQueryKey(entityId, spaceId, objectType, responseKind),
    queryFn: () => Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, objectType)),
    staleTime: 30_000,
  });

  const responderSpaceIds = React.useMemo(() => responders?.map(v => v.userId) ?? [], [responders]);

  if (responderSpaceIds.length === 0) return null;

  return (
    <RankingAggregatedSubmitterAvatars
      submitterSpaceIds={responderSpaceIds}
      totalCount={Math.max(totalResponders, responderSpaceIds.length)}
      size={12}
    />
  );
}
