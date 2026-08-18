'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';

import { useDailyActivityCompletion } from '~/core/space/use-daily-activity-completion';
import { useSpaceDailyActivityTasks } from '~/core/space/use-space-daily-activities';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

/**
 * The debates surface is full-screen and edge-to-edge (TikTok-style feed): no
 * space header, metadata, or tabs. This gate hides that chrome on any
 * `/space/<id>/debates...` route while keeping it everywhere else.
 */
export function SpaceChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && /^\/space\/[^/]+\/debates(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}

type SpaceHeaderContentContainerProps = {
  children: React.ReactNode;
  hasSidebar: boolean;
};

export function SpaceHeaderContentContainer({ children, hasSidebar }: SpaceHeaderContentContainerProps) {
  return (
    <EntityPageContentContainer variant={hasSidebar ? 'with-sidebar' : 'content'}>
      {children}
    </EntityPageContentContainer>
  );
}

type SpaceHeaderContentGateProps = {
  children: React.ReactNode;
  spaceId: string;
  hasCommunityCalls: boolean;
  isExternalTopic: boolean;
};

export function SpaceHeaderContentGate({
  children,
  spaceId,
  hasCommunityCalls,
  isExternalTopic,
}: SpaceHeaderContentGateProps) {
  const { tasks } = useSpaceDailyActivityTasks(spaceId);
  // The same completion the overview panel hides its checklist on. Read rather than watched here:
  // the panel owns the watchers, and where it isn't mounted there is no checklist to size around,
  // so an empty reading leaves this at the behaviour it had before.
  const { allComplete } = useDailyActivityCompletion(spaceId, tasks);
  const hasDailyActivities = tasks.length > 0 && !allComplete;
  const hasSidebar = !isExternalTopic && (hasCommunityCalls || hasDailyActivities);

  return <SpaceHeaderContentContainer hasSidebar={hasSidebar}>{children}</SpaceHeaderContentContainer>;
}
