import { Effect, Either } from 'effect';

import { FEATURED_TAG_ID, ROOT_SPACE, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
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

// Featured spaces are the Topic entities tagged Featured in the Root space, resolved to
// the top-ranked space claiming each one (see getTopRankedSpaceId). A topic becomes a
// pill only if a space claims it.
//
// This used to be discovered by walking the Subtopic tree hanging off the Root topic
// breadth-first, checking every node for the tag. That walk was pure discovery overhead:
// nothing downstream used tree position — the list is ordered by curated space rank, and
// always was. Measured against testnet it cost five *sequential* round trips, 2.95s and
// 276 KB to visit 3,038 nodes and find five spaces, all five of which were already found
// by round three. It also never finished: MAX_NODES capped the walk at 2,500 nodes with
// ~2,600 still queued, so a featured topic deep in the tree was simply invisible.
//
// The tag is an ordinary relation, so it can be asked for directly. One round trip,
// ~0.33s, ~4.5 KB — at the measured floor for *any* request to the API, so there is
// nothing further to win here by trimming fields. Optimise round trips, not selections.

// Ceiling on the pill list. Also bounds the query: the Featured tag is applied to things
// other than topics (rankings, for one), and the type filter below already narrows to
// Topic, so this is a sanity bound rather than a working limit.
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
    nodes: SpaceNode[];
  } | null;
}

interface FeaturedTopicsResult {
  relations: Array<{ fromEntity: TopicNode | null }> | null;
}

// Every Topic tagged Featured in Root, with the spaces claiming it and the page data the
// pill renders from.
//
// The Topic type filter is enforced here rather than after the fact, and it is load
// bearing: on testnet it takes the row count from 16 to 5 and the payload from 7.7 KB to
// 4.5 KB, and leaves nothing for the caller to filter out.
//
// Written relations-first on purpose. The entities-first shape — asking `entities` for
// Topic-typed rows carrying this relation — does not compile: `EntityToManyRelationFilter`
// has no `typeId` field. It would also be the wrong shape anyway, starting from a scan of
// every Topic rather than from the handful of indexed tag rows.
const FEATURED_TOPICS_QUERY = `
  {
    relations(filter: {
      typeId: { is: ${JSON.stringify(TAG_PROPERTY_ID)} }
      toEntityId: { is: ${JSON.stringify(FEATURED_TAG_ID)} }
      spaceId: { is: ${JSON.stringify(ROOT_SPACE)} }
      fromEntity: { typeIds: { overlaps: [${JSON.stringify(TOPIC_TYPE_ID)}] } }
    }, first: ${MAX_FEATURED}) {
      fromEntity {
        id
        name
        spacesByTopicIdConnection(first: 20) {
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
 * topic Featured in the Root space — so it changes on human timescales.
 *
 * Much less load-bearing than it was. This existed because discovering the list cost five
 * sequential round trips and `/api/explore/feed` ran it per request, which put Explore at
 * 4.2-4.5 s end to end while the ranked feed query it exists to serve was ~300 ms of that.
 * A cold miss now costs one round trip, so this is an ordinary "don't re-ask constantly"
 * cache rather than the thing standing between Explore and a four-second load.
 */
const FEATURED_SPACES_TTL_MS = 5 * 60 * 1000;

let shared: Promise<FeaturedSpace[]> | null = null;
// `null` means "still in flight". Kept distinct from a timestamp of 0 on purpose: while the
// list is unresolved there is nothing to expire, and treating it as infinitely stale sends
// every concurrent caller off to fetch its own — which is the pile-up this exists to stop.
let resolvedAt: number | null = null;

/** Exported for tests; no caller should need to reach for this. */
export function clearFeaturedSpacesCache(): void {
  shared = null;
  resolvedAt = null;
}

/**
 * {@link fetchFeaturedSpaces} with the fetch shared rather than repeated.
 *
 * Within the TTL a resolved list is reused outright; *before* it resolves, concurrent
 * callers join the one request in flight instead of each starting their own.
 * `/api/explore/feed` runs per request with no way to share a promise the way
 * `app/explore/page.tsx` does with the sidebar.
 *
 * A rejection is never cached, so a transient GraphQL failure costs one request rather
 * than five minutes of empty Featured panels. That includes the cancellation `runQuery`
 * deliberately re-throws: an aborted caller must not leave an aborted promise behind for
 * everyone else. Nothing here is per-request, so no signal is threaded through and one
 * caller going away cannot cancel the fetch for the rest.
 */
export function fetchFeaturedSpacesShared(): Promise<FeaturedSpace[]> {
  if (shared && (resolvedAt === null || Date.now() - resolvedAt < FEATURED_SPACES_TTL_MS)) return shared;

  const started = fetchFeaturedSpaces();
  shared = started;
  resolvedAt = null;
  // Only start the clock once the answer exists. Timing from the *call* would let a slow
  // fetch burn its own TTL and expire the moment it landed.
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
 * Builds the explore panel's "Join spaces" list: one entry per Topic tagged Featured in
 * the Root space that has a claiming space, resolved to the top-ranked claimant. Spaces
 * are deduped (a space can claim several featured topics). Ordered by curated space rank,
 * then name.
 */
export async function fetchFeaturedSpaces(): Promise<FeaturedSpace[]> {
  const result = await runQuery<FeaturedTopicsResult>(FEATURED_TOPICS_QUERY);
  // `runQuery` returns null only on a failed request (aborts already rethrew). Throwing
  // keeps a failure distinguishable from a genuinely empty Featured list, which is what
  // lets `fetchFeaturedSpacesShared` decline to cache it.
  if (result === null) throw new Error('Failed to load featured spaces');

  const seenSpaceIds = new Set<string>();
  const featured: FeaturedSpace[] = [];

  for (const relation of result.relations ?? []) {
    if (relation.fromEntity) addFeaturedFromTopic(relation.fromEntity, seenSpaceIds, featured);
  }

  // Display order is by curated space rank, then name.
  featured.sort((a, b) => {
    const rankDelta = getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId);
    if (rankDelta !== 0) return rankDelta;
    return a.name.localeCompare(b.name);
  });

  return featured.slice(0, MAX_FEATURED);
}

function addFeaturedFromTopic(topic: TopicNode, seenSpaceIds: Set<string>, featured: FeaturedSpace[]): void {
  // Root is never offered in its own Join-spaces panel. The traversal got this for free by
  // using the Root topic only as a seed and never emitting it; without a seed it has to be
  // said outright. Dropping Root from the *candidates* rather than skipping the whole topic
  // is the deliberate part: Root outranks everything (rank 0), so a topic claimed by both
  // Root and a real space would otherwise resolve to Root and lose the space worth joining.
  const spaceNodes = (topic.spacesByTopicIdConnection?.nodes ?? []).filter(s => s.id !== ROOT_SPACE);
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
