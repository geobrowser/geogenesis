'use client';

import * as React from 'react';

import { isDebateEntity } from '~/core/explore/explore-card-item';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { isModifiedClick } from '~/core/utils/is-modified-click';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type Props = {
  item: Pick<ExploreFeedItem, 'entityId' | 'spaceId' | 'types'>;
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

  // A debate is a full-screen video experience, so its title navigates even on Explore, where every
  // other title opens the panel (GEO-2794 amending GEO-2757). Putting the exception here rather
  // than at the four call sites is what makes it hold wherever a debate card is drawn — including
  // when `DebateExploreFeedCard` falls back to the generic card, which is a debate the panel would
  // serve especially badly.
  const opensPanel = opensSidePanel && !isDebateEntity(item.types);

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!opensPanel) return;
      if (isModifiedClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      // `openedWithMainViewEditing: false` — Explore has no editor behind it, so the panel has no
      // main-view edit session to return the viewer to.
      openSidePanel(item.entityId, item.spaceId, false);
    },
    [item.entityId, item.spaceId, opensPanel, openSidePanel]
  );

  return (
    <Link
      href={NavUtils.toEntity(item.spaceId, item.entityId)}
      entityId={item.entityId}
      spaceId={item.spaceId}
      className={className}
      onClick={onClick}
      // Exempts this link from the panel's capture-phase outside-pointerdown close
      // (`entity-side-panel.tsx`). Without it, clicking a second card while the panel is open
      // tears the panel down on `pointerdown` and the `onClick` below builds it again — a
      // close/reopen where the viewer asked to switch targets, running close cleanup in between.
      //
      // Conditional, and on the opt-in rather than on whether a panel happens to be open: the data
      // block explore view renders this same card *inside the editor*, which reads the attribute
      // too (`editor.tsx`) — and there the name navigates, so it is not an opener and must not
      // claim to be one.
      {...(opensPanel ? { 'data-entity-side-panel-opener': '' } : {})}
    >
      {children}
    </Link>
  );
}
