'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getEntityVoters } from '~/core/io/queries';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

export function ClaimVoterAvatars({
  entityId,
  spaceId,
  objectType,
  totalVoters,
}: {
  entityId: string;
  spaceId: string;
  objectType: 0 | 1;
  totalVoters: number;
}) {
  const { data: voters } = useQuery({
    queryKey: ['entity-voter-list', entityId, spaceId, objectType],
    queryFn: () => Effect.runPromise(getEntityVoters(entityId, spaceId, objectType)),
    staleTime: 30_000,
  });

  const voterSpaceIds = React.useMemo(() => voters?.map(v => v.userId) ?? [], [voters]);

  if (voterSpaceIds.length === 0) return null;

  return (
    <RankingAggregatedSubmitterAvatars
      submitterSpaceIds={voterSpaceIds}
      totalCount={Math.max(totalVoters, voterSpaceIds.length)}
      size={12}
    />
  );
}
