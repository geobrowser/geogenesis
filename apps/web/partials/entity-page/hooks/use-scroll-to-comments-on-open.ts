'use client';

import * as React from 'react';

import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';

import { holdCommentsInView } from '~/partials/comments/hold-comments-in-view';

/**
 * Scrolls a side panel to the entity's comments — a claim's Activity — when it is opened asking for them.
 *
 * The full page does this from `#entity-comments` in the URL, which the panel has no URL to carry, so
 * the request travels on the panel's target instead and each new target is one request.
 *
 * Three things make a one-off scroll land in the wrong place, and this handles them:
 *
 *  - The panel may be on another tab. It keeps its tab per entity, so a reader who opened a claim's
 *    Debates and then clicks that claim's activity count is still on Debates, where there is no
 *    Activity to scroll to. Each request returns the panel to the overview first — which is why this
 *    runs inside `EntitySidePanelActiveTabProvider`.
 *  - The section is not there when the panel opens. The panel loads the entity first and only then
 *    renders the body, so this waits for the anchor to appear rather than looking once.
 *  - What sits above it keeps growing after it appears. On a claim, the hero and the Debates/Claims
 *    gallery load their own data, and a scroll taken before they land ends up above the heading. So
 *    the position is re-applied as the content changes, for a short window — and never after the
 *    reader has scrolled, clicked or pressed a key themselves, because at that point the panel is
 *    theirs.
 *
 * Scrolls the container's own `scrollTop`, not `scrollIntoView`, which would also scroll every
 * scrollable ancestor — including the page behind the panel.
 *
 * The anchor is looked up inside the container, not with `getElementById`: an entity page behind the
 * panel has its own `#entity-comments`.
 */
export function useScrollToCommentsOnOpen(container: HTMLElement | null, request: object | null) {
  // The setter alone: it is stable, where the context value changes with every tab switch and would
  // restart the scroll each time.
  const selectTab = useEntitySidePanelActiveTab()?.setActiveTabId;

  React.useEffect(() => {
    if (!container || !request) return;
    selectTab?.(null);
    return holdCommentsInView(container);
  }, [container, request, selectTab]);
}
