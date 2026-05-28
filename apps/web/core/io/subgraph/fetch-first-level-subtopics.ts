import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either } from 'effect';

import { CURATED_TOPIC_TAG_ID, SUBTOPIC_RELATION_TYPE_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
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

// Cap how many top-level parents the traversal walks. Matches
// fetch-parent-topic-options so the "Any topic" chip list is exactly the
// union of subtopics across the parents shown in the dropdown.
const PARENT_PAGE_SIZE = 100;

// Cap subtopics per parent. Without this, a single popular parent with
// hundreds of subtopics could balloon the SSR payload. 200 is well above the
// chip list's INITIAL_VISIBLE_COUNT + "Show more" expansion needs.
const SUBTOPICS_PER_PARENT = 200;

/** Chip representation of an unclaimed curated topic — shared with the per-parent fetch. */
export interface RootTopicChip {
  id: string;
  name: string;
  image: string;
  /** Spaces the topic entity lives in. The chip link points at `spaceIds[0]` to avoid SpaceRedirect bouncing. */
  spaceIds: string[];
}

interface SubtopicEntity {
  id: string;
  name: string | null;
  createdAt: string | null;
  relationsList: SpaceImageRelationNode[];
  spacesByTopicIdConnection: { totalCount: number };
  spacesInConnection: { nodes: Array<{ id: string }> };
}

interface ParentNode {
  id: string;
  subtopics: {
    nodes: Array<{ toEntity: SubtopicEntity | null }>;
  };
}

interface NetworkResult {
  entitiesConnection: {
    nodes: ParentNode[];
  };
}

// Single query: start from every top-level curated Topic (no incoming SUBTOPIC
// backlinks) and walk outgoing SUBTOPIC relations to fetch the full subtopic
// payload. This is the same parent set the dropdown surfaces, so by
// construction the "Any topic" chip list equals the union of per-parent views.
//
// Why not reuse fetch-recently-claimed-spaces? That fetcher does a global
// top-N slice of curated topics by createdAt DESC, which can leave older
// subtopics outside the slice — making "Any topic" smaller than a single
// parent's filter view.
const QUERY = `
  {
    entitiesConnection(
      filter: {
        and: [
          { relations: { some: { typeId: { is: ${JSON.stringify(SystemIds.TYPES_PROPERTY)} }, toEntityId: { is: ${JSON.stringify(TOPIC_TYPE_ID)} } } } },
          { relations: { some: { typeId: { is: ${JSON.stringify(TAG_PROPERTY_ID)} }, toEntityId: { is: ${JSON.stringify(CURATED_TOPIC_TAG_ID)} } } } },
          { backlinks: { none: { typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} } } } }
        ]
      },
      first: ${PARENT_PAGE_SIZE}
    ) {
      nodes {
        id
        subtopics: relations(filter: { typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} } }, first: ${SUBTOPICS_PER_PARENT}) {
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
              spacesByTopicIdConnection(first: 1) {
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
 * Returns the unclaimed, curated, first-level subtopics across every top-level
 * curated parent topic. Drives the "Any topic" view of the explore panel.
 *
 * Filtering applied post-query:
 *   - dedup by subtopic id (a subtopic can belong to multiple parents)
 *   - skip claimed subtopics (`spacesByTopicIdConnection.totalCount > 0`)
 *   - skip subtopics with no containing space (chip link target would be missing)
 *
 * The query already restricts subtopics to immediate children of curated
 * top-level parents, so sub-sub-topics and orphan subtopics are naturally
 * excluded.
 */
export async function fetchFirstLevelSubtopics(): Promise<RootTopicChip[]> {
  const queryEffect = graphql<NetworkResult>({
    query: QUERY,
    endpoint: Environment.getConfig().api,
  });

  const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch first-level subtopics`);
    return [];
  }

  const parents = resultOrError.right?.entitiesConnection?.nodes ?? [];

  type Row = { chip: RootTopicChip; sortSec: number };
  const seen = new Set<string>();
  const rows: Row[] = [];

  for (const parent of parents) {
    for (const rel of parent.subtopics?.nodes ?? []) {
      const entity = rel.toEntity;
      if (!entity || seen.has(entity.id)) continue;

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
  }

  return rows.sort((a, b) => b.sortSec - a.sortSec).map(row => row.chip);
}
