import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExploreForYouCardProperty';

/**
 * Entities tagged with any followed topic, ranked like Best (gaia#983, testnet only: keep behind the
 * flag). `pageInfo.hasNextPage` is always false, so it isn't selected; a full page means more.
 */
const EXPLORE_FOR_YOU_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query ExploreForYouConnection(
    $first: Int
    $offset: Int
    $topicIds: [UUID!]
    $spaceIds: [UUID!]
    $typeIds: [UUID!]
    $createdAfter: String
    $filter: EntityFilter
    $maxPerTopic: Int
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
      filter: $filter
      maxPerTopic: $maxPerTopic
      debateTaggedClaims: $debateTaggedClaims
    ) {
      nodes {
        matchedTopicIds(topicIds: $topicIds)
        ${exploreCardNodeFields(FRAGMENT)}
      }
    }
  }
`;

export const exploreForYouConnectionDocument = parse(EXPLORE_FOR_YOU_SOURCE) as TypedDocumentNode<any, any>;

const BEST_FRAGMENT = 'ExploreForYouBestCardProperty';

/**
 * Best by type, as `exploreBestByTypeConnectionDocument`, plus each row's followed topics, so For
 * you can leave followed items to the topic stream and keep its Best share for other topics.
 */
const EXPLORE_FOR_YOU_BEST_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(BEST_FRAGMENT)}

  query ExploreForYouBestConnection(
    $first: Int
    $offset: Int
    $topicIds: [UUID!]
    $spaceIds: [UUID!]
    $typeIds: [UUID!]
    $createdAfter: String
    $filter: EntityFilter
    $maxPerType: Int
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesRankedForFeedByTypeConnection(
      first: $first
      offset: $offset
      spaceIds: $spaceIds
      typeIds: $typeIds
      createdAfter: $createdAfter
      filter: $filter
      maxPerType: $maxPerType
    ) {
      nodes {
        matchedTopicIds(topicIds: $topicIds)
        ${exploreCardNodeFields(BEST_FRAGMENT)}
      }
    }
  }
`;

export const exploreForYouBestConnectionDocument = parse(EXPLORE_FOR_YOU_BEST_SOURCE) as TypedDocumentNode<any, any>;
