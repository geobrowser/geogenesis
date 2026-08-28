import type { Metadata } from 'next';

import { DebatesHubWorkspace } from '~/core/debates/matchmaking/hub-workspace';

/**
 * The full-screen matchmaking hub.
 *
 * Top-level and cross-space on purpose: the hub spans spaces by design, so a `/space/[id]/` URL
 * would read as a bug the first time someone shared the link — and `/space/[id]/debates` is already
 * the *watch* feed, which is a different product.
 *
 * `/matchmaking` rather than `/debate` because `/debate` and the existing `/debates` differ by one
 * character while meaning different surfaces, which is a durable footgun for shared links and for
 * reading logs. The path is jargon; the page is still titled Debates.
 *
 * No server-side fetching: every list behind this is geo-chat or the knowledge graph through
 * react-query on the client, and the page has to resolve for signed-out visitors, so there is
 * nothing to await here.
 */
export const metadata: Metadata = {
  title: 'Debates',
  description: 'Find a claim, take a side, and get paired with someone who disagrees.',
};

export default function MatchmakingRoutePage() {
  return <DebatesHubWorkspace />;
}
