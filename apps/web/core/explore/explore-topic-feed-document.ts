import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExploreTopicFeedCardProperty';

/**
 * A topic page's Best or New in one ranked walk (gaia#983, gaia#985, GEO-3092): entities tagged with
 * every one of `topicIds`, ordered like the complete-population sort. `pageInfo.hasNextPage` is
 * always false, so it isn't selected; a full page means more.
 */
const EXPLORE_TOPIC_FEED_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query ExploreTopicFeedConnection(
    $first: Int
    $offset: Int
    $topicIds: [UUID!]
    $spaceIds: [UUID!]
    $typeIds: [UUID!]
    $createdAfter: String
    $maxPerTopic: Int
    $sortBy: String
    $matchAll: Boolean
    $debateTaggedClaims: Boolean
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesRankedForTopicsConnection(
      first: $first
      offset: $offset
      topicIds: $topicIds
      spaceIds: $spaceIds
      typeIds: $typeIds
      createdAfter: $createdAfter
      maxPerTopic: $maxPerTopic
      sortBy: $sortBy
      matchAll: $matchAll
      debateTaggedClaims: $debateTaggedClaims
    ) {
      nodes {
        ${exploreCardNodeFields(FRAGMENT)}
      }
    }
  }
`;

export const exploreTopicFeedConnectionDocument = parse(EXPLORE_TOPIC_FEED_SOURCE) as TypedDocumentNode<any, any>;

/** Per-type sizes of the same population (gaia#985); a type with no entities is absent. */
export const topicFeedTypeCountsDocument = parse(/* GraphQL */ `
  query TopicFeedTypeCounts(
    $topicIds: [UUID!]
    $typeIds: [UUID!]
    $spaceIds: [UUID!]
    $matchAll: Boolean
    $debateTaggedClaims: Boolean
  ) {
    topicFeedTypeCounts(
      topicIds: $topicIds
      typeIds: $typeIds
      spaceIds: $spaceIds
      matchAll: $matchAll
      debateTaggedClaims: $debateTaggedClaims
    ) {
      typeId
      entityCount
    }
  }
`) as TypedDocumentNode<
  { topicFeedTypeCounts?: Array<{ typeId?: string | null; entityCount?: string | number | null } | null> | null },
  {
    topicIds: string[];
    typeIds: string[];
    spaceIds: string[];
    matchAll: boolean;
    debateTaggedClaims: boolean;
  }
>;
