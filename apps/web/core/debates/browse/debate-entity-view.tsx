'use client';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { DEBATE_TIME_PARAM, parseDebateTimeParam } from '~/core/debates/debate-timecode';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';

import { DebatesBrowseFeed } from './debate-feed';
import { debateIdFromEntityPath } from './debate-feed-url';

type DebateEntityViewProps = {
  spaceId: string;
  /** The Debate entity id — anchors the feed to this debate (matched against the geo-chat debate id). */
  debateId: string;
  /** The normal entity page, rendered on the server and shown only in edit mode. */
  editView: React.ReactNode;
  /** Shown if geo-chat reports the debate removed after the page rendered (GEO-2785). */
  removedView?: React.ReactNode;
};

/**
 * A published Debate is a live video, not a wall of values. In browse mode we drop the visitor
 * straight into the `/debates` infinite-scroll feed anchored to this debate; the raw entity page
 * (props, relations, blocks) is only for editors and shows up when edit mode is on. If the debates
 * feature is off we fall back to the entity page so nothing is ever hidden without a way to see it.
 */
export function DebateEntityView({ spaceId, debateId, editView, removedView }: DebateEntityViewProps) {
  const isEditing = useUserIsEditing(spaceId);
  // A link may name the moment it wants — a claim extracted from this debate pointing back at
  // where it was said. Null when the link is not asking for one, and also when it asks for
  // something that is not a position: see `parseDebateTimeParam` for why that is not clamped to 0.
  const initialSeekSeconds = parseDebateTimeParam(useSearchParams().get(DEBATE_TIME_PARAM));

  // The feed rewrites this page's path to the debate on screen as the viewer scrolls, without a
  // navigation, so `debateId` — the route param — stays the debate the page was *opened* at. Coming
  // Back to the page then restores that route with the newer URL, and anchoring on the param opened
  // the feed on a debate the viewer had long scrolled past. The router's pathname is the one that
  // names what they were watching, and on an ordinary navigation it agrees with the param.
  //
  // Latched at mount: it changes on every swipe, and an anchor that followed it would hoist each
  // debate to the top of the feed as the viewer reached it.
  const pathname = usePathname();
  const [anchorId] = React.useState(() => debateIdFromEntityPath(pathname, spaceId) ?? debateId);

  // `editView` and `removedView` were rendered on the server for `debateId`. Once the URL names
  // another debate they describe the wrong one: edit mode would open debate A's value sheet under
  // debate B's address. Anything server-rendered waits for the route to catch up with the URL.
  const urlDebateId = debateIdFromEntityPath(pathname, spaceId);
  const routeIsStale = urlDebateId != null && !ID.equals(urlDebateId, debateId);
  const serverView = (view: React.ReactNode) => (routeIsStale ? <ResyncRouteToUrl /> : view);

  if (isEditing) {
    return <>{serverView(editView)}</>;
  }

  // Browse mode shows the live video, but if this debate isn't watchable in the space's feed we
  // fall back to the entity page rather than the feed's "space not found" error.
  return (
    <DebatesBrowseFeed
      spaceId={spaceId}
      initialDebateId={anchorId}
      surface="debate-page"
      initialSeekSeconds={initialSeekSeconds}
      fallback={serverView(editView)}
      removedView={serverView(removedView)}
    />
  );
}

/**
 * Re-renders the page for the URL the feed has moved to, so its server-rendered views describe the
 * debate on screen. A replace to the address already showing: no history entry, and edit mode — a
 * global atom — carries over to the remounted page.
 */
function ResyncRouteToUrl() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace(`${window.location.pathname}${window.location.search}`, { scroll: false });
  }, [router]);
  return null;
}
