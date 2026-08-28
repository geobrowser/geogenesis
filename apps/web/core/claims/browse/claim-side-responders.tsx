'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getEntityResponders } from '~/core/io/queries';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  entityRespondersQueryKey,
} from '~/core/responses/entity-response';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

import { CLAIM_RESPONSE_OBJECT_TYPE } from './claim-response-summary';

/**
 * The faces on one side of a claim.
 *
 * `ClaimResponderAvatars` draws everyone who responded regardless of which way they went, which is
 * right for a single inline stack beside a score but wrong under a split — used on both sides it
 * shows the same people agreeing and disagreeing. The responder rows already carry a `direction`,
 * so this filters on it.
 *
 * Same query key as that component, so the two share one fetch wherever both are on screen.
 */
export function ClaimSideResponders({
  entityId,
  spaceId,
  responseKind,
  direction,
  totalResponders,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  direction: ActiveResponseDirection;
  /** The authoritative count for this side, which can exceed the faces the query returns. */
  totalResponders: number;
}) {
  const { data: responders } = useQuery({
    queryKey: entityRespondersQueryKey(entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind),
    queryFn: () => Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, CLAIM_RESPONSE_OBJECT_TYPE)),
    staleTime: 30_000,
  });

  const spaceIds = React.useMemo(
    () => (responders ?? []).filter(responder => responder.direction === direction).map(responder => responder.userId),
    [direction, responders]
  );

  if (spaceIds.length === 0) return null;

  return (
    <RankingAggregatedSubmitterAvatars
      submitterSpaceIds={spaceIds}
      // The counts come from the aggregate query, which can be ahead of the responder rows; taking
      // the larger keeps the "+N" honest rather than letting it go negative.
      totalCount={Math.max(totalResponders, spaceIds.length)}
      size={12}
    />
  );
}
