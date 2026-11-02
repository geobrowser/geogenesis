import * as React from 'react';

import type { Metadata } from 'next';

import { HubSkeleton } from '~/core/debates/matchmaking/hub-states';
import { DebatesHubWorkspace } from '~/core/debates/matchmaking/hub-workspace';

import { Text } from '~/design-system/text';

/** Full-screen matchmaking hub — top-level (cross-space), client-fetched, path avoids `/debate` vs `/debates`. */
export const metadata: Metadata = {
  title: 'Debates',
  description: 'Find a claim, take a side, and get paired with someone who disagrees.',
};

export default function MatchmakingRoutePage() {
  return (
    <React.Suspense fallback={<WorkspaceLoading />}>
      <DebatesHubWorkspace />
    </React.Suspense>
  );
}

function WorkspaceLoading() {
  return (
    <div className="flex w-full flex-col">
      <header className="sticky top-11 z-20 flex items-center justify-between gap-3 bg-white px-4 py-5">
        <Text as="h1" variant="mainPage" color="text">
          Debates
        </Text>
      </header>

      <div className="px-4">
        <HubSkeleton />
      </div>
    </div>
  );
}
