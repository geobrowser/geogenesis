'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { ClaimsTab } from './claims-tab';
import { HubLiveRail } from './hub-live-rail';

/**
 * Full-screen matchmaking hub (GEO-2726): claims centre, facet + live rails.
 * Named `@container/hub` collapse: facets first, then live; narrow falls back to panel menus.
 * Width is capped by the shell's 1200px `<main>`.
 */
export function DebatesHubWorkspace() {
  return (
    <div className="@container/hub flex w-full flex-col">
      <header className="sticky top-11 z-20 flex items-center justify-between gap-3 bg-white px-4 py-5">
        <Text as="h1" variant="mainPage" color="text">
          Debates
        </Text>
      </header>

      <div className="flex gap-8 px-4">
        <div className="min-w-0 flex-1">
          <ClaimsTab layout="workspace" />
        </div>

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
