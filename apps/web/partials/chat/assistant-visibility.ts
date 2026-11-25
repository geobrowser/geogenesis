'use client';

import { useAtomValue } from 'jotai';
import { usePathname } from 'next/navigation';

import { useMediaQuery } from '~/core/hooks/use-media-query';

import { debateFullscreenActiveAtom, entityTemplatePagesOnScreenAtom } from '~/atoms';

const FULLSCREEN_CHILD_ROUTE_SUFFIXES = ['/ranking-compose'] as const;

// The claim-exploration picker is its own full-screen overlay, and it parks a voice dock in the
// bottom-right corner — exactly where the assistant's launcher floats.
// The graph explorer is a full-screen map with its zoom controls in that same corner, and the
// assistant has no part to play on it (GEO-3849).
const FULLSCREEN_CHILD_ROUTE_PATTERNS = [/\/debates\/rematches\/[^/]+$/, /^\/explore\/graph(\/|$)/] as const;

function isFullscreenChildRoute(pathname: string): boolean {
  return (
    FULLSCREEN_CHILD_ROUTE_SUFFIXES.some(suffix => pathname.endsWith(suffix)) ||
    FULLSCREEN_CHILD_ROUTE_PATTERNS.some(pattern => pattern.test(pathname))
  );
}

/**
 * Whether the assistant's launcher and panel stay out of the way: on the full-screen routes, and on
 * a phone while the debate feed is full-screen. Shared by the launcher, which is all that loads at
 * startup, and the widget behind it.
 */
export function useHideAssistant(): boolean {
  const pathname = usePathname() ?? '';
  const debateFullscreenActive = useAtomValue(debateFullscreenActiveAtom);
  // Match the debate feed's `md:` fullscreen overlay breakpoint.
  const isMobile = useMediaQuery('(max-width: 767px)');
  return isFullscreenChildRoute(pathname) || (isMobile && debateFullscreenActive);
}

/**
 * Whether only the floating button stays off: on an entity page that uses a v2 template (GEO-3846),
 * where it competes with the template. The panel itself still opens there, from Cmd/Ctrl+K or from
 * a template's add-source "+", which hands its link to the assistant.
 */
export function useHideAssistantLauncher(): boolean {
  return useAtomValue(entityTemplatePagesOnScreenAtom) > 0;
}
