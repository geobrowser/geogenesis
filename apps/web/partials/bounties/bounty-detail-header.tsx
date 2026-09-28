'use client';

import * as React from 'react';

import { useBountiesEnabled } from '~/core/bounties/config';
import { useBountyDetail } from '~/core/bounties/use-bounty-detail';
import { useBountyRoles } from '~/core/bounties/use-bounty-roles';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';

import { Skeleton } from '~/design-system/skeleton';

import { BountyInfoCard } from './bounty-info-card';
import { EditableBountyInfoCard } from './bounty-info-card-editable';
import { BountyInterestCard } from './bounty-interest-card';

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
  // The network gate is checked server-side; the per-browser bountiesTab flag
  // can only be honored here, in the client (same for the side panel).
  const enabled = useBountiesEnabled();
  const { data, isLoading, isError } = useBountyDetail(spaceId, bountyId);
  const roles = useBountyRoles(data?.bounty, data?.interest ?? []);
  const isEditing = useUserIsEditing(spaceId);

  if (!enabled) return null;
  if (isLoading) return <BountyDetailHeaderSkeleton />;
  if (isError || !data) return null;

  // Edit mode replaces the facts card with in-place editors writing through
  // the local store; the page's normal review flow publishes them. No
  // separate edit route or button.
  if (isEditing) {
    return (
      <div className="flex flex-col gap-4" data-testid="bounty-detail-header">
        <EditableBountyInfoCard bounty={data.bounty} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="bounty-detail-header">
      <BountyInfoCard bounty={data.bounty} showStatus={roles.isEditor} />
      <BountyInterestCard detail={data} roles={roles} />
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
