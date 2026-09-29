import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

/**
 * One `totalCount` per Topic feed type, aliased `t0`…`tN` in `TOPIC_FEED_ENTITY_TYPE_IDS` order.
 *
 * The type ids are this module's own constants, so they are written into the document rather
 * than threaded through eleven variables.
 */
const SPACE_TOPIC_COUNT_SOURCE = /* GraphQL */ `
  query SpaceTopicFeedTypeCounts($spaceIds: UUIDFilter!, $filter: EntityFilter) {
    ${TOPIC_FEED_ENTITY_TYPE_IDS.map(
      (typeId, index) =>
        `t${index}: entitiesConnection(first: 0, spaceIds: $spaceIds, typeIds: { in: ["${typeId}"] }, filter: $filter) { totalCount }`
    ).join('\n    ')}
  }
`;

export type SpaceTopicCountResult = Record<string, { totalCount: number | string | null } | null>;

export const spaceTopicCountDocument = parse(SPACE_TOPIC_COUNT_SOURCE) as TypedDocumentNode<
  SpaceTopicCountResult,
  { spaceIds: { in: string[] }; filter: unknown }
>;
