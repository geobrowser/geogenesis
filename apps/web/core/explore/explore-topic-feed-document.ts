import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExploreTopicFeedCardProperty';

/**
 * A topic page's feed (GEO-3092): entities tagged with every one of `topicIds` (`matchAll`), in
 * Best or New order, served from gaia's topic ranking table (gaia#983, #985) rather than by
 * downloading the topic's whole population and sorting it here.
 *
 * Offset-paged, like `exploreBestByTypeConnectionDocument`, and `maxPerTopic` is correctness for
 * the same reason `maxPerType` is: below `offset + first` a page comes back short. `pageInfo` is
 * not selected because this connection always reports `hasNextPage: false`; a full page means more.
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
    $debateTaggedClaims: Boolean
    $sortBy: String
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
      debateTaggedClaims: $debateTaggedClaims
      sortBy: $sortBy
      matchAll: true
    ) {
      nodes {
        ${exploreCardNodeFields(FRAGMENT)}
      }
    }
  }
`;

export const exploreTopicFeedConnectionDocument = parse(EXPLORE_TOPIC_FEED_SOURCE) as TypedDocumentNode<any, any>;
