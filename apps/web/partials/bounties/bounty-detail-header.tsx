'use client';

import * as React from 'react';

import { useBountyDetail } from '~/core/bounties/use-bounty-detail';
import { useBountyRoles } from '~/core/bounties/use-bounty-roles';

import { Skeleton } from '~/design-system/skeleton';

import { BountyInfoCard } from './bounty-info-card';

type Props = {
  spaceId: string;
  bountyId: string;
};

/**
 * Rendered in the entity page's notice slot for Bounty-typed entities: the
 * structured facts above the markdown body. The body itself, comments, and
 * backlinks are the ordinary entity page.
 */
export function BountyDetailHeader({ spaceId, bountyId }: Props) {
  const { data, isLoading, isError } = useBountyDetail(spaceId, bountyId);
  const roles = useBountyRoles(data?.bounty, data?.interest ?? []);

  if (isLoading) return <BountyDetailHeaderSkeleton />;
  if (isError || !data) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="bounty-detail-header">
      <BountyInfoCard bounty={data.bounty} showStatus={roles.isEditor} />
    </div>
  );
}

export function BountyDetailHeaderSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-lg border border-grey-02 bg-white p-4 md:grid-cols-2"
      aria-busy
    >
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
