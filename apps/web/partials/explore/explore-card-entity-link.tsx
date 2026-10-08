'use client';

import * as React from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { capture } from '~/core/analytics';
import { isDebateEntity } from '~/core/debates/is-debate-entity';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { type OpenSidePanelOptions, useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { isModifiedClick } from '~/core/utils/is-modified-click';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'children'> & {
  item: Pick<ExploreFeedItem, 'entityId' | 'spaceId' | 'types'>;
  /**
   * Whether an unmodified left click opens the side panel instead of navigating (GEO-2757).
   * Off by default: `ExploreFeedCard` is also the row for a space's activity tab, a topic's
   * Coverage section, and a data block's explore view, and this only changes Explore.
   */
  opensSidePanel?: boolean;
  /**
   * A position on the entity's page — the href's fragment — and where the panel should open instead.
   * The panel has no URL to carry a fragment, so each link that has one says what it means there.
   */
  section?: { hash: string; sidePanel: OpenSidePanelOptions };
  children: React.ReactNode;
};

/**
 * The entity name on an Explore card — and any other link on one into the entity, such as a claim's
 * activity count, which goes where the name goes but to a position on the page (`section`).
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
export function ExploreCardEntityLink({ item, opensSidePanel = false, section, children, ...anchorProps }: Props) {
  const { openSidePanel } = useEntitySidePanel();

  // A debate is a full-screen video experience, so a title pointing at one navigates even on
  // Explore, where every other title opens the panel (GEO-2794 amending GEO-2757). Putting the
  // exception here rather than at the call sites is what makes it hold wherever such a title is
  // drawn — including when `DebateExploreFeedCard` falls back to the generic card, which is a
  // debate the panel would serve especially badly.
  //
  // Note this is keyed on what the title *opens*, not on what card it sits on: a debate card is
  // normally headed by the claim it argued (`exploreCardHeading`), and that heading points at the
  // Claim, which the panel serves well. The exception is for the debate itself, which a heading
  // only names when the Claims relation is missing.
  const requiresFullPage = isDebateEntity(item.types);
  const opensPanel = opensSidePanel && !requiresFullPage;

  // GEO-3144: an open is engagement, credited like a vote or comment to the feed version behind the
  // card, which the card's action scope carries. Recorded on every click that opens it, panel or page.
  const snapshot = useActionContext('explore_feed_card', 'entity', item.entityId);
  const recordOpen = React.useCallback(() => {
    try {
      capture('element_clicked', { ...snapshot(), source: 'explore_feed_card', element_action: 'open' });
    } catch {
      /* Optional telemetry. */
    }
  }, [snapshot]);

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      recordOpen();
      if (!opensPanel) return;
      if (isModifiedClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      // `openedWithMainViewEditing: false` — Explore has no editor behind it, so the panel has no
      // main-view edit session to return the viewer to.
      openSidePanel(item.entityId, item.spaceId, false, section?.sidePanel);
    },
    [item.entityId, item.spaceId, opensPanel, openSidePanel, recordOpen, section?.sidePanel]
  );

  const pageHref = NavUtils.toEntity(item.spaceId, item.entityId);

  return (
    <Link
      {...anchorProps}
      href={section ? `${pageHref}#${section.hash}` : pageHref}
      entityId={item.entityId}
      spaceId={item.spaceId}
      onClick={onClick}
      onAuxClick={recordOpen}
      data-entity-side-panel-full-page={requiresFullPage || undefined}
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
