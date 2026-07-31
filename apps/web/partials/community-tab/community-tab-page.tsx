'use client';

import * as React from 'react';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

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
    <EntityPageContentContainer>
      <div className="flex min-w-0 flex-col gap-10 pb-8">
        <CuratorLeaderboardSection spaceId={spaceId} />
        <CompletedBountiesSection spaceId={spaceId} />
        <InProgressBountiesSection spaceId={spaceId} />
        <AvailableBountiesSection spaceId={spaceId} />
      </div>
    </EntityPageContentContainer>
  );
}
