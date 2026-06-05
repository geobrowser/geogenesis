import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either } from 'effect';

import { CURATED_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { Environment } from '~/core/environment';

import { graphql } from './graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from './space-image';
import { PLACEHOLDER_TOPIC_NAME } from './topic-space-usage';

// A "curated topic" is an entity that is both:
//   - typed as Topic via the standard `types` property, AND
//   - tagged with the curated-topic-tag entity via the `tag` property.
// Both filters are required — Topic type alone surfaces ~40k arbitrary
// knowledge nodes; the curated tag scopes to the editorially-approved set.

// Cap how many curated topics we scan for claim rows per request. Testnet has
// ~1,860 curated topics — 200 is plenty for the panel and keeps the response
// small.
const PAGE_SIZE = 200;

export interface RecentlyClaimedSpace {
  spaceId: string;
  topicId: string;
  name: string;
  image: string;
  memberCount: number;
}

interface SpaceNode {
  id: string;
  page: {
    id: string;
    name: string | null;
    relationsList: SpaceImageRelationNode[];
  } | null;
  members: { totalCount: number } | null;
}

interface TopicEntityNode {
  id: string;
  name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  spacesByTopicIdConnection: {
    totalCount: number;
    nodes: SpaceNode[];
  };
}

interface NetworkResult {
  entitiesConnection: {
    nodes: TopicEntityNode[];
  };
}

const QUERY = `
  {
    entitiesConnection(
      filter: {
        and: [
          { relations: { some: { typeId: { is: ${JSON.stringify(SystemIds.TYPES_PROPERTY)} }, toEntityId: { is: ${JSON.stringify(TOPIC_TYPE_ID)} } } } },
          { relations: { some: { typeId: { is: ${JSON.stringify(TAG_PROPERTY_ID)} }, toEntityId: { is: ${JSON.stringify(CURATED_TOPIC_TAG_ID)} } } } }
        ]
      },
      orderBy: [CREATED_AT_DESC],
      first: ${PAGE_SIZE}
    ) {
      nodes {
        id
        name
        createdAt
        updatedAt
        spacesByTopicIdConnection(first: 1) {
          totalCount
          nodes {
            id
            page {
              id
              name
              relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
                typeId
                toEntity {
                  valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
                    propertyId
                    text
                  }
                }
              }
            }
            members {
              totalCount
            }
          }
        }
      }
    }
  }
`;

function toUnixSec(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveTopicName(name: string | null | undefined): string {
  if (!name || !name.trim()) return PLACEHOLDER_TOPIC_NAME;
  return name;
}

/**
 * Returns the spaces that have recently claimed a curated topic, sorted by
 * the topic entity's `updatedAt` (claiming a topic bumps it).
 */
export async function fetchRecentlyClaimedSpaces(): Promise<RecentlyClaimedSpace[]> {
  const queryEffect = graphql<NetworkResult>({
    query: QUERY,
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch recently claimed spaces`);
    return [];
  }

  const nodes = resultOrError.right?.entitiesConnection?.nodes ?? [];

  type Row = { space: RecentlyClaimedSpace; sortSec: number };
  const rowsBySpaceId = new Map<string, Row>();

  for (const entity of nodes) {
    const spaceCount = entity.spacesByTopicIdConnection?.totalCount ?? 0;
    if (spaceCount === 0) continue;

    const name = resolveTopicName(entity.name);
    // Sort key is the topic entity's updatedAt: when a space claims a topic it
    // adds new relations to the entity, which bumps updatedAt. Falls back to
    // createdAt for topics with no recorded update.
    const sortSec = toUnixSec(entity.updatedAt) || toUnixSec(entity.createdAt);

    for (const space of entity.spacesByTopicIdConnection.nodes ?? []) {
      if (rowsBySpaceId.has(space.id)) continue;
      const spaceName = space.page?.name?.trim() ? space.page.name : name;
      const spaceImage = resolveSpaceImage(space.page?.relationsList ?? [], space.id);
      rowsBySpaceId.set(space.id, {
        space: {
          spaceId: space.id,
          topicId: entity.id,
          name: spaceName,
          image: spaceImage,
          memberCount: space.members?.totalCount ?? 0,
        },
        sortSec,
      });
    }
  }

  return Array.from(rowsBySpaceId.values())
    .sort((a, b) => b.sortSec - a.sortSec)
    .map(row => row.space);
}
