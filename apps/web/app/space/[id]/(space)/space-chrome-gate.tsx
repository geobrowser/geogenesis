'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';

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
  spaceId: string;
  hasSidebar: boolean;
};

export function SpaceHeaderContentContainer({ children, spaceId, hasSidebar }: SpaceHeaderContentContainerProps) {
  const pathname = usePathname();
  const isSpaceHome = pathname === `/space/${spaceId}` || pathname === `/space/${spaceId}/`;

  return (
    <EntityPageContentContainer variant={isSpaceHome && hasSidebar ? 'with-sidebar' : 'content'}>
      {children}
    </EntityPageContentContainer>
  );
}
