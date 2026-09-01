'use client';

import * as React from 'react';

import { AccretionDashboardCard } from './accretion-dashboard-card';
import { BountiesStatusSection } from './community-bounties-sections';
import { CuratorLeaderboardSection } from './curator-leaderboard-section';

type Props = {
  spaceId: string;
};

export function CommunityTabPage({ spaceId }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-10 pb-8">
      <AccretionDashboardCard spaceId={spaceId} />
      <CuratorLeaderboardSection spaceId={spaceId} />
      <BountiesStatusSection spaceId={spaceId} status="completed" />
      <BountiesStatusSection spaceId={spaceId} status="in-progress" />
      <BountiesStatusSection spaceId={spaceId} status="available" />
    </div>
  );
}
