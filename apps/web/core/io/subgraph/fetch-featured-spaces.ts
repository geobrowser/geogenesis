import { Effect, Either } from 'effect';

import { FEATURED_TAG_ID, ROOT_SPACE, SUBTOPIC_RELATION_TYPE_ID, TAG_PROPERTY_ID } from '~/core/constants';
import { Environment } from '~/core/environment';
import { getSpaceRank, getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

import { AbortError } from './errors';
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

/**
 * Attempts per traversal round before the whole traversal is failed, and the pause between them.
 *
 * The frontier query asks 200 topics at once for their claiming spaces, images and subtopics, which
 * makes it the heaviest thing on the Explore path and the first to be shed when the API is under
 * load — it comes back as a GraphQL *error*, not a transport failure, and `graphql` only retries
 * Railway DNS blips. One re-attempt clears the transient ones. Kept to a single retry on purpose:
 * the traversal is already five sequential round trips, and this runs inside a request.
 */
const ROUND_ATTEMPTS = 2;
const ROUND_RETRY_DELAY_MS = 250;

function isAbort(error: unknown): boolean {
  return (
    error instanceof AbortError ||
    (typeof error === 'object' && error !== null && (error as { _tag?: string })._tag === 'AbortError')
  );
}

/**
 * One round of the traversal, or a rejection.
 *
 * Never resolves to "no data" on failure. A round that returned `null` used to read downstream as a
 * frontier with nothing in it, which ends the loop and returns whatever had been collected so far —
 * so a single shed query produced a short, or empty, Featured list that every caller then treated
 * as the complete answer. For a signed-out reader the Featured list *is* the whole visible space
 * scope of Explore, so that empty list emptied the feed and the surface reported it as "No entities
 * match these filters yet".
 */
async function runQuery<T>(query: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < ROUND_ATTEMPTS; attempt++) {
    const resultOrError = await Effect.runPromise(
      Effect.either(graphql<T>({ query, endpoint: Environment.getConfig().api }))
    );

    if (Either.isRight(resultOrError)) return resultOrError.right;

    const error = resultOrError.left;
    // A cancelled caller is not a failing API: there is nothing to retry and the rejection must
    // keep propagating so the shared traversal does not cache an abort as an answer.
    if (isAbort(error)) throw error;
    lastError = error;

    if (attempt < ROUND_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, ROUND_RETRY_DELAY_MS));
    }
  }

  const tag = (lastError as { _tag?: string } | undefined)?._tag ?? 'UnknownError';
  console.error(`${tag}: Unable to fetch featured spaces`);
  throw new Error('Failed to load featured spaces');
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

/**
 * The most recent list a traversal actually walked to completion, kept past its TTL.
 *
 * The Featured set is curated — an editor tags a topic Featured in the Root space — so a five
 * minute old copy of it is right in every way that matters to a reader, and serving it beats
 * serving nothing when a refresh fails. Nothing here is stale in the sense that matters: what
 * changed is our ability to re-read it, not the answer.
 */
let lastResolved: FeaturedSpace[] | null = null;

/** Exported for tests; no caller should need to reach for this. */
export function clearFeaturedSpacesCache(): void {
  shared = null;
  resolvedAt = null;
  lastResolved = null;
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

  const traversal = fetchFeaturedSpaces();
  // A failed refresh falls back to the last complete walk rather than to nothing. Only a *complete*
  // one is ever stored, so this can serve a list that is a few minutes old but never a partial one.
  // An abort still propagates: the caller went away, and swallowing it here would let one
  // cancelled request install an answer for everyone else.
  const started = traversal.then(
    featured => {
      lastResolved = featured;
      return featured;
    },
    error => {
      if (isAbort(error) || lastResolved === null) throw error;
      console.error('Featured spaces traversal failed; serving the last list walked in full', error);
      return lastResolved;
    }
  );
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
export async function fetchFeaturedSpaces(): Promise<FeaturedSpace[]> {
  const root = await runQuery<RootResult>(ROOT_QUERY);
  const rootTopicId = root.space?.topicId;
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

    // Rejects rather than returning an empty round, so a shed query cannot end the walk early and
    // pass a truncated list off as the complete one. See `runQuery`.
    const result = await runQuery<FrontierResult>(frontierQuery(batch));
    const topics = result.entities ?? [];

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
