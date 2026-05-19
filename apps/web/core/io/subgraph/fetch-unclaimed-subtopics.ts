import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { Effect, Either } from 'effect';

import {
  CURATED_TOPIC_TAG_ID,
  SUBTOPIC_RELATION_TYPE_ID,
  TAG_PROPERTY_ID,
  TOPIC_TYPE_ID,
} from '~/core/constants';
import { Environment } from '~/core/environment';

import type { RootTopicChip } from './fetch-first-level-subtopics';
import { graphql } from './graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from './space-image';
import { PLACEHOLDER_TOPIC_NAME } from './topic-space-usage';

interface SubtopicEntity {
  id: string;
  name: string | null;
  createdAt: string | null;
  relationsList: SpaceImageRelationNode[];
  types: Array<{ toEntityId: string }>;
  tag: Array<{ toEntityId: string }>;
  spacesByTopicIdConnection: { totalCount: number };
  spacesInConnection: { nodes: Array<{ id: string }> };
}

interface NetworkResult {
  entity: {
    subtopics: {
      nodes: Array<{ toEntity: SubtopicEntity | null }>;
    } | null;
  } | null;
}

const buildQuery = (parentId: string) => `
  {
    entity(id: ${JSON.stringify(parentId)}) {
      subtopics: relations(filter: { typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} } }) {
        nodes {
          toEntity {
            id
            name
            createdAt
            relationsList(filter: { typeId: { in: [${JSON.stringify(AVATAR_PROPERTY_ID)}, ${JSON.stringify(COVER_PROPERTY_ID)}] } }) {
              typeId
              toEntity {
                valuesList(filter: { propertyId: { is: ${JSON.stringify(IMAGE_URL_PROPERTY_ID)} } }) {
                  propertyId
                  text
                }
              }
            }
            types: relationsList(filter: { typeId: { is: ${JSON.stringify(SystemIds.TYPES_PROPERTY)} }, toEntityId: { is: ${JSON.stringify(TOPIC_TYPE_ID)} } }) {
              toEntityId
            }
            tag: relationsList(filter: { typeId: { is: ${JSON.stringify(TAG_PROPERTY_ID)} }, toEntityId: { is: ${JSON.stringify(CURATED_TOPIC_TAG_ID)} } }) {
              toEntityId
            }
            spacesByTopicIdConnection {
              totalCount
            }
            spacesInConnection {
              nodes { id }
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
 * Returns the unclaimed, curated subtopics of a given parent topic.
 *
 * Filters applied post-query (the indexer doesn't expose a single composite
 * filter that combines all of these):
 *   - subtopic entity has Topic type (via TYPES_PROPERTY relation)
 *   - subtopic entity carries the curated-topic tag (via TAG_PROPERTY relation)
 *   - subtopic has no entries in `spacesByTopicIdConnection` (unclaimed)
 *   - subtopic lives in at least one space (so the chip link has a valid target)
 */
export async function fetchUnclaimedSubtopics(parentTopicId: string): Promise<RootTopicChip[]> {
  const queryEffect = graphql<NetworkResult>({
    query: buildQuery(parentTopicId),
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch unclaimed subtopics for ${parentTopicId}`);
    return [];
  }

  const nodes = resultOrError.right?.entity?.subtopics?.nodes ?? [];

  type Row = { chip: RootTopicChip; sortSec: number };
  const seen = new Set<string>();
  const rows: Row[] = [];

  for (const rel of nodes) {
    const entity = rel.toEntity;
    if (!entity || seen.has(entity.id)) continue;

    const isTopic = (entity.types?.length ?? 0) > 0;
    const isCurated = (entity.tag?.length ?? 0) > 0;
    if (!isTopic || !isCurated) continue;

    const claimCount = entity.spacesByTopicIdConnection?.totalCount ?? 0;
    if (claimCount > 0) continue;

    const spaceIds = (entity.spacesInConnection?.nodes ?? []).map(s => s.id);
    if (spaceIds.length === 0) continue;

    seen.add(entity.id);
    rows.push({
      chip: {
        id: entity.id,
        name: resolveTopicName(entity.name),
        image: resolveSpaceImage(entity.relationsList ?? []),
        spaceIds,
      },
      sortSec: toUnixSec(entity.createdAt),
    });
  }

  return rows.sort((a, b) => b.sortSec - a.sortSec).map(row => row.chip);
}
