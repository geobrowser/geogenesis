'use client';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

import { spaceSidebarHasContentAtom } from '~/atoms';

/**
 * The debates surface is full-screen and edge-to-edge (TikTok-style feed): no
 * space header, metadata, or tabs. This gate hides that chrome on any
 * `/space/<id>/debates...` (or `/root/debates...`) route while keeping it everywhere else.
 */
export function SpaceChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && /^(\/space\/[^/]+|\/root)\/debates(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}

function useIsSidebarRoute() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (searchParams.get('tabId')) return false;
  return pathname != null && /^(\/space\/[^/]+|\/root)(\/community)?\/?$/.test(pathname);
}

type SpaceHeaderContentContainerProps = {
  children: React.ReactNode;
  hasSidebar: boolean;
};

export function SpaceHeaderContentContainer({ children, hasSidebar }: SpaceHeaderContentContainerProps) {
  const isSidebarRoute = useIsSidebarRoute();

  return (
    <EntityPageContentContainer variant={hasSidebar && isSidebarRoute ? 'with-sidebar' : 'content'}>
      {children}
    </EntityPageContentContainer>
  );
}

type SpaceHeaderContentGateProps = {
  children: React.ReactNode;
  serverHasSidebar: boolean;
  isExternalTopic: boolean;
};

export function SpaceHeaderContentGate({ children, serverHasSidebar, isExternalTopic }: SpaceHeaderContentGateProps) {
  const sidebarContent = useAtomValue(spaceSidebarHasContentAtom);
  const hasSidebar = !isExternalTopic && (sidebarContent !== null ? sidebarContent : serverHasSidebar);

  return <SpaceHeaderContentContainer hasSidebar={hasSidebar}>{children}</SpaceHeaderContentContainer>;
}
