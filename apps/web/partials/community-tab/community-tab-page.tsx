'use client';

import * as React from 'react';

import {
  AvailableBountiesSection,
  CompletedBountiesSection,
  InProgressBountiesSection,
} from './community-bounties-sections';
import { CuratorLeaderboardSection } from './curator-leaderboard-section';

type Props = {
  spaceId: string;
};

export function CommunityTabPage({ spaceId }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-10 pb-8">
      <CuratorLeaderboardSection spaceId={spaceId} />
      <CompletedBountiesSection spaceId={spaceId} />
      <InProgressBountiesSection spaceId={spaceId} />
      <AvailableBountiesSection spaceId={spaceId} />
    </div>
  );
}
