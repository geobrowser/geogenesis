'use client';

import * as React from 'react';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { isModifiedClick } from '~/core/utils/is-modified-click';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type Props = {
  item: Pick<ExploreFeedItem, 'entityId' | 'spaceId'>;
  /**
   * Whether an unmodified left click opens the side panel instead of navigating (GEO-2757).
   * Off by default: `ExploreFeedCard` is also the row for a space's activity tab, a topic's
   * Coverage section, and a data block's explore view, and this only changes Explore.
   */
  opensSidePanel?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * The entity name on an Explore card.
 *
 * Deliberately a real anchor with a real `href` even when it opens the panel, and only unmodified
 * left clicks are intercepted. A panel is not a page: cmd/ctrl-click, shift-click and middle click
 * have to keep opening the entity page in a new tab or window, which is how people read a graph
 * (GEO-2701). A button with an `onClick` would look identical and break every one of them, along
 * with "copy link address" and the status-bar preview.
 *
 * Middle click needs no branch here — browsers deliver it as `auxclick`, so this handler never
 * runs and the anchor's own behavior stands. The check in {@link isModifiedClick} covers it anyway
 * for the sake of one rule rather than two.
 *
 * The panel itself is mounted globally in `app/entry.tsx`, so nothing has to be rendered alongside
 * the card for this to have somewhere to land.
 */
export function ExploreCardEntityLink({ item, opensSidePanel = false, className, children }: Props) {
  const { openSidePanel } = useEntitySidePanel();

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!opensSidePanel) return;
      if (isModifiedClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      // `openedWithMainViewEditing: false` — Explore has no editor behind it, so the panel has no
      // main-view edit session to return the viewer to.
      openSidePanel(item.entityId, item.spaceId, false);
    },
    [item.entityId, item.spaceId, opensSidePanel, openSidePanel]
  );

  return (
    <Link
      href={NavUtils.toEntity(item.spaceId, item.entityId)}
      entityId={item.entityId}
      spaceId={item.spaceId}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
