import { Effect, Either } from 'effect';

import {
  FEATURED_TAG_ID,
  PLACEHOLDER_SPACE_IMAGE,
  ROOT_SPACE,
  SUBTOPIC_RELATION_TYPE_ID,
  TAG_PROPERTY_ID,
} from '~/core/constants';
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
 * How long a resolved Featured list is reused. The set is curated — an editor tags a
 * topic Featured in the Root space — so it changes on human timescales, while the
 * traversal that discovers it is the most expensive thing on the Explore path.
 *
 * The cost is a real measurement, not a guess: against production the traversal is five
 * *sequential* round trips that visit 2,941 topic nodes and transfer 274 KB to discover
 * four featured spaces, and `/api/explore/feed` — which runs it on every request — takes
 * 4.2-4.5 s end to end while the ranked feed query it exists to serve is ~300 ms of that.
 */
const FEATURED_SPACES_TTL_MS = 5 * 60 * 1000;

let shared: Promise<FeaturedSpace[]> | null = null;
// `null` means "still in flight". Kept distinct from a timestamp of 0 on purpose: while the
// traversal is unresolved there is nothing to expire, and treating it as infinitely stale
// sends every concurrent caller off to start a traversal of its own — which is the exact
// pile-up this function exists to stop.
let resolvedAt: number | null = null;

/** Exported for tests; no caller should need to reach for this. */
export function clearFeaturedSpacesCache(): void {
  shared = null;
  resolvedAt = null;
}

/**
 * {@link fetchFeaturedSpaces} with the traversal shared rather than repeated.
 *
 * Two distinct wins, and the second is the one that showed up in production. Within the
 * TTL a resolved list is reused outright; *before* it resolves, concurrent callers join
 * the one in-flight traversal instead of each starting their own. `/api/explore/feed`
 * runs per request with no way to share a promise the way `app/explore/page.tsx` does
 * with the sidebar, so every simultaneous Explore load was walking the whole topic tree
 * on its own.
 *
 * A rejection is never cached, so a transient GraphQL failure costs one traversal rather
 * than five minutes of empty Featured panels. That includes the cancellation
 * `resolveFeaturedSpaces` deliberately re-throws: an aborted caller must not leave an
 * aborted promise behind for everyone else. Nothing here is per-request, so no signal is
 * threaded through and one caller going away cannot cancel the traversal for the rest.
 */
export function fetchFeaturedSpacesShared(): Promise<FeaturedSpace[]> {
  if (shared && (resolvedAt === null || Date.now() - resolvedAt < FEATURED_SPACES_TTL_MS)) return shared;

  const started = fetchFeaturedSpaces();
  shared = started;
  resolvedAt = null;
  // Only start the clock once the answer exists. Timing from the *call* would let a slow
  // traversal burn its own TTL and expire the moment it landed.
  started.then(
    () => {
      if (shared === started) resolvedAt = Date.now();
    },
    () => {
      if (shared === started) clearFeaturedSpacesCache();
    }
  );
  return started;
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
/**
 * EXPERIMENT ONLY — GEO-2777 isolation. Do not merge.
 *
 * The five spaces the live traversal actually returns, frozen. Skips every query the
 * discovery step makes so a cold-instance measurement isolates the traversal's cost from
 * everything else on the route.
 */
const HARDCODED_FEATURED: FeaturedSpace[] = [
  { spaceId: 'c9f267dcb0d270718c2a3c45a64afd32', topicId: '0fcd62b5798f4078b84fa535ac95fcf3', name: 'Crypto', image: PLACEHOLDER_SPACE_IMAGE, memberCount: 297 },
  { spaceId: '41e851610e13a19441c4d980f2f2ce6b', topicId: '8cb0a2b4adbf4627aa080cec5112099a', name: 'AI', image: PLACEHOLDER_SPACE_IMAGE, memberCount: 303 },
  { spaceId: '52c7ae149838b6d47ce0f3b2a5974546', topicId: 'b97f07a619fd4ab0bb3d8296a8a26ab9', name: 'Health', image: PLACEHOLDER_SPACE_IMAGE, memberCount: 252 },
  { spaceId: '89bd89bf28ff8a0963faf92a8c905e20', topicId: '49fbca0730974581a9f0300d52fd22d6', name: 'World affairs', image: PLACEHOLDER_SPACE_IMAGE, memberCount: 73 },
  { spaceId: '4582fbbee28a16589154f7e36f1ee3c5', topicId: 'f51d68d17d544a96800bc447c8ecb0d3', name: 'US Politics', image: PLACEHOLDER_SPACE_IMAGE, memberCount: 42 },
];

export async function fetchFeaturedSpaces(): Promise<FeaturedSpace[]> {
  // EXPERIMENT ONLY — GEO-2777. Returns before any query so a cold-instance measurement
  // isolates the traversal's cost from the rest of the route.
  return HARDCODED_FEATURED;
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
