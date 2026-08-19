'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();
  const isOverviewRoute = pathname != null && /^\/space\/[^/]+\/?$/.test(pathname);

  return (
    <EntityPageContentContainer variant={hasSidebar && isOverviewRoute ? 'with-sidebar' : 'content'}>
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
  const hasSidebar = !isExternalTopic && (hasCommunityCalls || tasks.length > 0);

  return <SpaceHeaderContentContainer hasSidebar={hasSidebar}>{children}</SpaceHeaderContentContainer>;
}
