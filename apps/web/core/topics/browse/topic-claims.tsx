'use client';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { TopicExploreSection, type TopicSectionMode } from './topic-explore-section';

/**
 * Claims made about this topic.
 *
 * A Claim renders as `ClaimExploreFeedCard` — the explore feed's own card, with labelled position
 * pills and the shared verdict column — because {@link TopicExploreSection} hands every row to
 * `ExploreFeedCard`, which dispatches on the entity's types. This used to draw
 * `MatchmakingClaimCard`, the bordered pill card built for the debates side panel, which meant a
 * claim looked like one thing in Explore and another here (GEO-2910).
 */
export function TopicClaims({
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
      typeIds={[CLAIM_TYPE_ID]}
      label="Claims"
      mode={mode}
      viewAllSlot={viewAllSlot}
    />
  );
}
