'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { ClaimsTab } from './claims-tab';
import { HubLiveRail } from './hub-live-rail';

/**
 * The full-screen matchmaking hub: facets, the claims corpus, and a live rail.
 *
 * GEO-2726. The panel's problem was never its width — it gave a 48,000-claim corpus and three
 * volatile now-lists equal billing in one 400px column behind four tabs. This is the same
 * components in a layout that stops making them siblings: the corpus gets the centre, the
 * narrowings that address it sit open beside it, and the three lists that matter *while* you browse
 * move out of the tab row entirely.
 *
 * A second surface, not a replacement. The panel opens over whatever you were reading without
 * losing it — a glance; this is a session. They share one set of components and one filter atom, so
 * expanding continues a search rather than restarting it.
 *
 * Collapse order is deliberate and matches the design: the facet rail goes first (every narrowing
 * in it is still reachable from the menus the panel uses, which is what the narrow layout falls
 * back to), then the live rail. Both are container queries on this element by name, so the two
 * decisions are measured against one width and cannot disagree — an unnamed query resolves to
 * whichever container happens to be nearest, which is how the rail first ended up hidden while the
 * layout still reserved a column for it.
 *
 * The thresholds are set against the shell's `max-w-[1200px]` on `<main>`, which every route
 * inherits — so the workspace tops out at 1200px however wide the window is. The design wants
 * roughly 1280px for three zones plus a detail pane; getting there means letting this route out of
 * that cap, which is a shell change rather than one this component can make.
 */
export function DebatesHubWorkspace() {
  return (
    // No `max-w` of its own: the app shell already caps every route at 1200px, so one here would
    // only ever be dead weight — and the thresholds below are set against that 1200px, not against
    // the viewport. See the note on the facet rail.
    <div className="@container/hub flex w-full flex-col">
      {/* `mainPage`, the variant every other route's h1 uses. Pinned under the navbar (h-11) so the
          page keeps saying what it is while the corpus scrolls. */}
      <header className="sticky top-11 z-20 flex items-center justify-between gap-3 bg-white px-4 py-5">
        <Text as="h1" variant="mainPage" color="text">
          Debates
        </Text>
      </header>

      {/* Flex with explicit rail widths rather than grid tracks: a hidden grid item still leaves
          its track behind, which is what left a column of empty space where the facet rail should
          have been. A hidden flex child takes no room at all. */}
      <div className="flex gap-8 px-4">
        {/* `min-w-0` so a long claim cannot set the column's floor and push the rail off. */}
        <div className="min-w-0 flex-1">
          <ClaimsTab layout="workspace" />
        </div>

        {/* Second to go, after the facet rail — both measured against `/hub`, so the two decisions
            cannot disagree. Its lists stay reachable from the panel, one press away in the navbar. */}
        {/* Sticky rather than its own scroll container. Stacking overflow areas is what made the
            rail read as several panels side by side; sticking it to the viewport lets the page
            scroll as one, and the rail only scrolls itself once it is taller than the screen. */}
        <aside
          aria-label="Live"
          className="sticky top-[7.5rem] hidden max-h-[calc(100dvh-8.5rem)] w-80 shrink-0 self-start overflow-y-auto @[64rem]/hub:block"
        >
          <HubLiveRail />
        </aside>
      </div>
    </div>
  );
}
