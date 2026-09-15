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
 *
 * Except on a person's profile (GEO-2859), where the same feed is a *tab* rather
 * than the whole surface. Stripping the chrome there removes the tab bar that got
 * you here and leaves no way back to the profile — so `keepChrome` holds it, and
 * the header keeps its own container while the feed below stays edge-to-edge.
 */
export function SpaceChromeGate({ children, keepChrome = false }: { children: React.ReactNode; keepChrome?: boolean }) {
  const pathname = usePathname();
  if (!keepChrome && pathname && /^(\/space\/[^/]+|\/root)\/debates(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}

/**
 * Routes that render a space rail on the server today (Overview + Community, for a
 * space or `/root`). This is used ONLY to seed the header width before the rail has
 * reported its content on the client — so a hard load of a rail route paints at the
 * right width instead of flashing narrow → wide, and a non-rail tab (which never
 * renders a rail on the server) is never seeded wide. Once the rail reports via the
 * atom, that takes over for whatever tab is showing — see SpaceHeaderContentGate.
 */
function useIsSidebarSeedRoute() {
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
  return (
    <EntityPageContentContainer variant={hasSidebar ? 'with-sidebar' : 'content'}>{children}</EntityPageContentContainer>
  );
}

type SpaceHeaderContentGateProps = {
  children: React.ReactNode;
  serverHasSidebar: boolean;
  isExternalTopic: boolean;
};

export function SpaceHeaderContentGate({ children, serverHasSidebar, isExternalTopic }: SpaceHeaderContentGateProps) {
  const sidebarContent = useAtomValue(spaceSidebarHasContentAtom);
  const isSeedRoute = useIsSidebarSeedRoute();

  // Content-driven on every tab: once the rail reports whether it has content (via
  // the atom, after hydration), that alone decides the header width for whichever
  // tab is showing — no hardcoded per-tab list, so any tab that grows a rail widens
  // the header automatically. Before the atom is set (SSR / first paint) fall back
  // to the server's per-space signal, but only on routes that actually render a rail,
  // so a non-rail tab is never seeded wide and a rail route never flashes.
  const hasSidebar = !isExternalTopic && (sidebarContent !== null ? sidebarContent : serverHasSidebar && isSeedRoute);

  return <SpaceHeaderContentContainer hasSidebar={hasSidebar}>{children}</SpaceHeaderContentContainer>;
}
