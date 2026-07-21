import { Effect, Either } from 'effect';

import { FEATURED_TAG_ID, ROOT_SPACE, SUBTOPIC_RELATION_TYPE_ID, TAG_PROPERTY_ID } from '~/core/constants';
import { Environment } from '~/core/environment';
import { getSpaceRank, getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

import { graphql } from './graphql';
import {
  AVATAR_PROPERTY_ID,
  COVER_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  type SpaceImageRelationNode,
  resolveSpaceImage,
} from './space-image';
import { PLACEHOLDER_TOPIC_NAME } from './topic-space-usage';

// Featured spaces are discovered by walking the Subtopic relation tree that
// hangs off the Root space's topic entity, breadth-first. We start at the top
// (Root's direct subtopics) and work down, so shallow — i.e. most prominent —
// topics surface first. A topic becomes a pill only if it is tagged Featured in
// the Root space and has at least one space claiming it; when several spaces
// share a topic we feature the top-ranked one (see getTopRankedSpaceId).

// How many entity ids we expand per round. Batching keeps the number of
// sequential round-trips small while staying well under any query-size limit.
const BATCH_SIZE = 200;

// Hard ceilings so a pathological tree (the subtopic graph has cycles and
// duplicate relations) can't balloon the SSR cost. Top-down BFS means the cap
// trims the deepest, least-prominent topics first — exactly what we'd drop.
const MAX_NODES = 2500;
const MAX_FEATURED = 60;

export interface FeaturedSpace {
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

interface TopicNode {
  id: string;
  name: string | null;
  spacesByTopicIdConnection: {
    totalCount: number;
    nodes: SpaceNode[];
  } | null;
  featuredTags: Array<{ spaceId: string; toEntity: { id: string } | null }> | null;
  subtopics: Array<{ toEntity: { id: string } | null }> | null;
}

interface RootResult {
  space: { topicId: string | null } | null;
}

interface FrontierResult {
  entities: TopicNode[];
}

const ROOT_QUERY = `
  {
    space(id: ${JSON.stringify(ROOT_SPACE)}) {
      topicId
    }
  }
`;

// Resolve one frontier batch: each topic's claiming spaces (for pill data) and
// its immediate subtopics (for the next frontier).
function frontierQuery(ids: string[]): string {
  return `
  {
    entities(filter: { id: { in: ${JSON.stringify(ids)} } }) {
      id
      name
      spacesByTopicIdConnection(first: 20) {
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
      featuredTags: relationsList(filter: {
        typeId: { is: ${JSON.stringify(TAG_PROPERTY_ID)} }
        toEntityId: { is: ${JSON.stringify(FEATURED_TAG_ID)} }
        spaceId: { is: ${JSON.stringify(ROOT_SPACE)} }
      }) {
        spaceId
        toEntity {
          id
        }
      }
      subtopics: relationsList(filter: { typeId: { is: ${JSON.stringify(SUBTOPIC_RELATION_TYPE_ID)} } }) {
        toEntity {
          id
        }
      }
    }
  }
`;
}

function resolveTopicName(name: string | null | undefined): string {
  if (!name || !name.trim()) return PLACEHOLDER_TOPIC_NAME;
  return name;
}

async function runQuery<T>(query: string): Promise<T | null> {
  const resultOrError = await Effect.runPromise(
    Effect.either(graphql<T>({ query, endpoint: Environment.getConfig().api }))
  );

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch featured spaces`);
    return null;
  }

  return resultOrError.right;
}

/**
 * Builds the explore panel's "Join spaces" list by walking the Root space's
 * subtopic tree top-down and emitting one entry per topic tagged Featured in
 * the Root space that has a claiming space. The Root topic itself is used only
 * as the traversal seed — it is not featured. Untagged topics are still
 * traversed so featured descendants remain discoverable. Spaces are deduped (a
 * space can claim multiple topics). Traversal order is top-down only so the node
 * cap trims the deepest topics first; the returned list is ordered by space rank
 * (then name), not tree position.
 */
export async function fetchFeaturedSpaces(): Promise<FeaturedSpace[]> {
  const root = await runQuery<RootResult>(ROOT_QUERY);
  const rootTopicId = root?.space?.topicId;
  if (!rootTopicId) return [];

  // Seed the traversal with the Root topic's children so the Root topic (and
  // therefore the Root space) is never featured in its own panel.
  const visited = new Set<string>([rootTopicId]);
  const seenSpaceIds = new Set<string>();
  const featured: FeaturedSpace[] = [];

  let frontier: string[] = [rootTopicId];

  while (frontier.length > 0 && visited.size < MAX_NODES && featured.length < MAX_FEATURED) {
    const batch = frontier.slice(0, BATCH_SIZE);
    const overflow = frontier.slice(BATCH_SIZE);

    const result = await runQuery<FrontierResult>(frontierQuery(batch));
    const topics = result?.entities ?? [];

    const nextFrontier: string[] = [];

    for (const topic of topics) {
      // Emit a pill if this topic is tagged Featured in Root and a space claims
      // it. Skip the Root topic seed (it still comes back in round 1).
      if (topic.id !== rootTopicId) {
        addFeaturedFromTopic(topic, seenSpaceIds, featured);
      }

      for (const rel of topic.subtopics ?? []) {
        const childId = rel.toEntity?.id;
        if (!childId || visited.has(childId)) continue;
        visited.add(childId);
        nextFrontier.push(childId);
      }
    }

    frontier = [...overflow, ...nextFrontier];
  }

  // Display order is by curated space rank, then name — independent of where
  // the space sat in the subtopic tree.
  featured.sort((a, b) => {
    const rankDelta = getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId);
    if (rankDelta !== 0) return rankDelta;
    return a.name.localeCompare(b.name);
  });

  return featured.slice(0, MAX_FEATURED);
}

function addFeaturedFromTopic(topic: TopicNode, seenSpaceIds: Set<string>, featured: FeaturedSpace[]): void {
  const hasRootFeaturedTag = (topic.featuredTags ?? []).some(
    relation => relation.spaceId === ROOT_SPACE && relation.toEntity?.id === FEATURED_TAG_ID
  );
  if (!hasRootFeaturedTag) return;

  const spaceNodes = topic.spacesByTopicIdConnection?.nodes ?? [];
  if (spaceNodes.length === 0) return;

  const topRankedId = getTopRankedSpaceId(spaceNodes.map(s => s.id));
  if (!topRankedId) return;

  const space = spaceNodes.find(s => s.id === topRankedId);
  if (!space || seenSpaceIds.has(space.id)) return;
  seenSpaceIds.add(space.id);

  const topicName = resolveTopicName(topic.name);
  const name = space.page?.name?.trim() ? space.page.name : topicName;
  const image = resolveSpaceImage(space.page?.relationsList ?? [], space.id);

  featured.push({
    spaceId: space.id,
    topicId: topic.id,
    name,
    image,
    memberCount: space.members?.totalCount ?? 0,
  });
}
