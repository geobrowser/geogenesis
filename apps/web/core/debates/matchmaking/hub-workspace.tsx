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
 * back to), then the live rail. Both are container queries on the workspace rather than viewport
 * media queries, so the same component would behave in a narrower host without new breakpoints.
 */
export function DebatesHubWorkspace() {
  return (
    <div className="@container mx-auto flex w-full max-w-[110rem] flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-5">
        <Text as="h1" variant="mediumTitle" color="text">
          Debates
        </Text>
      </header>

      <div className="grid min-h-0 gap-6 @[75rem]:grid-cols-[minmax(0,1fr)_20rem]">
        {/* `min-w-0` on the corpus column: without it a long claim sets the column's minimum and the
            grid stops honouring the rail's track. */}
        <div className="min-w-0">
          <ClaimsTab layout="workspace" />
        </div>

        {/* Second to go, after the facet rail. Its lists stay reachable from the panel, which is
            still one press away in the navbar. */}
        <aside aria-label="Live" className="hidden min-h-0 overflow-y-auto @[75rem]:block">
          <HubLiveRail />
        </aside>
      </div>
    </div>
  );
}
