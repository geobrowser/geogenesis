'use client';

import * as React from 'react';

import { useBountyDetail } from '~/core/bounties/use-bounty-detail';
import { useBountyRoles } from '~/core/bounties/use-bounty-roles';

import { BountyAllocationTabs } from './bounty-allocation-tabs';

type Props = {
  spaceId: string;
  bountyId: string;
};

/**
 * Rendered in the entity page's belowBodySlot for Bounty-typed entities: the
 * sections that follow the brief — who is working on it (allocation), and in
 * later milestones the submissions and payouts.
 */
export function BountyDetailSections({ spaceId, bountyId }: Props) {
  const { data } = useBountyDetail(spaceId, bountyId);
  const roles = useBountyRoles(data?.bounty, data?.interest ?? []);

  if (!data) return null;

  return (
    <div className="flex flex-col gap-8" data-testid="bounty-detail-sections">
      <BountyAllocationTabs detail={data} roles={roles} />
    </div>
  );
}
