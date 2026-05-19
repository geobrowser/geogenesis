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

// Cap how many curated topics we fetch per request. Testnet has ~1,860 curated
// topics — 200 is plenty for the panel and keeps the response small.
const ROOT_TOPICS_PAGE_SIZE = 200;

export interface RootTopicChip {
  id: string;
  name: string;
  image: string;
  /** Spaces this topic entity lives in — drives client-side chip filtering. */
  spaceIds: string[];
}

export interface RecentlyClaimedSpace {
  spaceId: string;
  topicId: string;
  name: string;
  image: string;
  memberCount: number;
}

export interface RootTopicsData {
  unclaimed: RootTopicChip[];
  recentlyClaimed: RecentlyClaimedSpace[];
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

interface TopicSpaceInNode {
  id: string;
}

interface TopicEntityNode {
  id: string;
  name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  relationsList: SpaceImageRelationNode[];
  spacesByTopicIdConnection: {
    totalCount: number;
    nodes: SpaceNode[];
  };
  spacesInConnection: {
    nodes: TopicSpaceInNode[];
  };
}

interface NetworkResult {
  entitiesConnection: {
    nodes: TopicEntityNode[];
  };
}

// Returns the curated Topic entities themselves. Each entity carries:
//   - `spacesByTopicIdConnection` → spaces that have claimed it (for "Recently claimed").
//   - `spacesInConnection` → spaces the entity lives in (for client-side chip filtering).
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
      first: ${ROOT_TOPICS_PAGE_SIZE}
    ) {
      nodes {
        id
        name
        createdAt
        updatedAt
        relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
          typeId
          toEntity {
            valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
              propertyId
              text
            }
          }
        }
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
        spacesInConnection {
          nodes { id }
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

export async function fetchRootTopics(): Promise<RootTopicsData> {
  const queryEffect = graphql<NetworkResult>({
    query: QUERY,
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch root topics`);
    return { unclaimed: [], recentlyClaimed: [] };
  }

  const nodes = resultOrError.right?.entitiesConnection?.nodes ?? [];

  type UnclaimedRow = { chip: RootTopicChip; sortSec: number };
  type ClaimedRow = { space: RecentlyClaimedSpace; sortSec: number };

  const unclaimedById = new Map<string, UnclaimedRow>();
  const claimedBySpaceId = new Map<string, ClaimedRow>();

  for (const entity of nodes) {
    const spaceCount = entity.spacesByTopicIdConnection?.totalCount ?? 0;
    const name = resolveTopicName(entity.name);
    const image = resolveSpaceImage(entity.relationsList ?? []);

    if (spaceCount === 0) {
      const spaceIds = (entity.spacesInConnection?.nodes ?? []).map(s => s.id);
      // Skip topics with no containing space — we'd have nowhere to link the
      // chip to, and pointing at ROOT_SPACE would trigger SpaceRedirect's
      // history-replacing client redirect.
      if (spaceIds.length === 0) continue;
      unclaimedById.set(entity.id, {
        chip: { id: entity.id, name, image, spaceIds },
        sortSec: toUnixSec(entity.createdAt),
      });
      continue;
    }

    // Spaces exist for this topic — surface each as a "recently claimed" row.
    // Sort key is the topic entity's updatedAt: when a space claims a topic it
    // adds new relations to the entity, which bumps updatedAt. Falls back to
    // createdAt for topics with no recorded update.
    const sortSec = toUnixSec(entity.updatedAt) || toUnixSec(entity.createdAt);

    for (const space of entity.spacesByTopicIdConnection.nodes ?? []) {
      if (claimedBySpaceId.has(space.id)) continue;
      const spaceName = space.page?.name?.trim() ? space.page.name : name;
      const spaceImage = resolveSpaceImage(space.page?.relationsList ?? [], space.id);
      claimedBySpaceId.set(space.id, {
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

  const unclaimed = Array.from(unclaimedById.values())
    .sort((a, b) => b.sortSec - a.sortSec)
    .map(row => row.chip);

  const recentlyClaimed = Array.from(claimedBySpaceId.values())
    .sort((a, b) => b.sortSec - a.sortSec)
    .map(row => row.space);

  return { unclaimed, recentlyClaimed };
}
