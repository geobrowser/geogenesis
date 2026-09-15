'use client';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

import { spaceSidebarHasContentAtom } from '~/atoms';

const FULL_BLEED_ROUTE = /^(\/space\/[^/]+|\/root)\/debates(\/|$)/;

/**
 * The debates surface is full-screen and edge-to-edge (TikTok-style feed): no
 * space header, metadata, or tabs. This gate hides that chrome on any
 * `/space/<id>/debates...` (or `/root/debates...`) route while keeping it everywhere else.
 *
 * Except on a person's profile (GEO-2859), where Debates is a *tab* rather than
 * the whole surface. Stripping the chrome there removes the tab bar that got you
 * here and leaves no way back to the profile.
 */
export function SpaceChromeGate({ children, keepChrome = false }: { children: React.ReactNode; keepChrome?: boolean }) {
  const pathname = usePathname();
  const isFullBleedRoute = pathname != null && FULL_BLEED_ROUTE.test(pathname);

  if (isFullBleedRoute && !keepChrome) return null;

  // `Main` drops its own vertical padding on this route, for the feed that
  // normally fills it. A profile keeping its chrome has to put the top of that
  // padding back, or its cover image sits flush against the navbar on this one
  // tab and nowhere else. The bottom half belongs to the page's own content.
  if (isFullBleedRoute) return <div className="pt-8">{children}</div>;

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
    <EntityPageContentContainer variant={hasSidebar ? 'with-sidebar' : 'content'}>
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
