import type { Metadata } from 'next';

import { DebatesHubWorkspace } from '~/core/debates/matchmaking/hub-workspace';

/** Full-screen matchmaking hub — top-level (cross-space), client-fetched, path avoids `/debate` vs `/debates`. */
export const metadata: Metadata = {
  title: 'Debates',
  description: 'Find a claim, take a side, and get paired with someone who disagrees.',
};

export default function MatchmakingRoutePage() {
  return <DebatesHubWorkspace />;
}
