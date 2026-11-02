import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * Per-type entity counts for a topic page's composition strip (gaia#985), over the same population
 * `exploreTopicFeedConnectionDocument` pages through. A type with no entities is absent from the
 * list rather than returned as zero.
 */
const TOPIC_FEED_TYPE_COUNTS_SOURCE = /* GraphQL */ `
  query TopicFeedTypeCounts($topicIds: [UUID!], $typeIds: [UUID!], $spaceIds: [UUID!], $debateTaggedClaims: Boolean) {
    topicFeedTypeCounts(
      topicIds: $topicIds
      typeIds: $typeIds
      spaceIds: $spaceIds
      debateTaggedClaims: $debateTaggedClaims
      matchAll: true
    ) {
      typeId
      entityCount
    }
  }
`;

export type TopicFeedTypeCountsResult = {
  topicFeedTypeCounts?: Array<{ typeId?: string | null; entityCount?: number | string | null } | null> | null;
};

export const topicFeedTypeCountsDocument = parse(TOPIC_FEED_TYPE_COUNTS_SOURCE) as TypedDocumentNode<
  TopicFeedTypeCountsResult,
  { topicIds: string[]; typeIds: string[]; spaceIds: string[]; debateTaggedClaims: boolean }
>;
