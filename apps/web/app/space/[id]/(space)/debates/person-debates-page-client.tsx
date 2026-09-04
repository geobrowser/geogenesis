'use client';

import * as React from 'react';

import { usePersonDebateStats } from '~/core/debates/use-person-debate-stats';

import { Skeleton } from '~/design-system/skeleton';

import { PersonClaimsCollection } from './person-claims-collection';
import { PersonDebateStatsStrip } from './person-debate-stats-strip';
import { PersonDebatesCollection } from './person-debates-collection';

/**
 * A person's Debates tab: their debate record on their own profile.
 */
export function PersonDebatesPageClient({ personId }: { personId: string }) {
  const { stats, isLoading, isWinRateLoading, winnerShares } = usePersonDebateStats(personId);

  return (
    <div className="@container flex flex-col gap-8 py-6">
      {isLoading || !stats ? (
        <StripSkeleton />
      ) : (
        <PersonDebateStatsStrip stats={stats} isWinRateLoading={isWinRateLoading} />
      )}

      <PersonDebatesCollection personId={personId} winnerShares={winnerShares} />
      <PersonClaimsCollection personId={personId} />
    </div>
  );
}

function StripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 @[520px]:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[92px] w-full rounded-lg" />
      ))}
    </div>
  );
}
