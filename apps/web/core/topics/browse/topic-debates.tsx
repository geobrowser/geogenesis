'use client';

import { TopicExploreSection, type TopicSectionMode } from './topic-explore-section';

/**
 * Debates argued on this topic's claims.
 *
 * Two hops, because that is how the graph stores it: a Debate carries `Claims` and never `Topics`,
 * so there is no relation from a debate to a topic to read.
 *
 * This used to walk those hops in the client — fetch the topic's claims, then ask which debates
 * named any of them — with a hard cap of 100 claims, because a query carrying every claim id of a
 * 2,221-claim topic would have been enormous. The cap put 95% of a large topic's claims out of
 * reach of its own Debates section. `useTopicDebateRowsInfinite` expresses the same walk as a
 * nested filter the server resolves, so there is nothing left to cap and the list finally agrees
 * with the count on the tab (GEO-2910).
 *
 * The rows are `DebateExploreFeedCard`, reached through `ExploreFeedCard`'s dispatch — the same
 * rendition the full-screen debates feed gives a debate, rather than the claim page's row this
 * section used to borrow. Its title navigates rather than opening the side panel, which
 * `ExploreCardEntityLink` enforces for every debate card wherever it is drawn (GEO-2794).
 */
export function TopicDebates({
  topicId,
  spaceId,
  mode,
  viewAllSlot,
}: {
  topicId: string;
  spaceId: string;
  mode: TopicSectionMode;
  viewAllSlot?: React.ReactNode;
}) {
  return (
    <TopicExploreSection
      topicId={topicId}
      spaceId={spaceId}
      typeIds={[]}
      source="debates"
      label="Debates"
      mode={mode}
      viewAllSlot={viewAllSlot}
    />
  );
}
