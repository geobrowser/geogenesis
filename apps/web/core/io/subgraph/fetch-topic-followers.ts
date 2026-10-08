import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { interestedVoteCondition } from '~/core/topics/interested';
import { FOLLOWING_PROPERTY } from '~/core/topics/ontology';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

/**
 * Follow rows read per topic. Enough to count every topic exactly today; past it the count is the
 * server's raw row total. It bounds a feed's request at 25 topics × this many short rows.
 */
const FOLLOWER_ROWS = 500;

/**
 * How many follow a topic, and whether the viewer is already among them as indexed.
 *
 * `viewerIndexed` is what lets a control draw the viewer's own follow before the indexer has it:
 * the count it shows is the others plus the viewer, whatever the indexer has caught up to.
 */
export type TopicFollowers = {
  count: number;
  viewerIndexed: boolean;
};

/** A follow row in either shape: an Interested vote (`userId`) or a `Following` relation (`fromEntityId`). */
type FollowRow = { userId?: string; fromEntityId?: string; spaceId: string };
type Connection = { totalCount: number; nodes?: FollowRow[] };

/**
 * One aliased connection per topic, so a feed's worth of cards is one request, plus one
 * viewer-scoped total per topic when there is a viewer.
 *
 * A follow counts once per follower, and only as written in the follower's own personal space —
 * the space the app writes it to, and the one the viewer's own follows are read from. Flag on, a
 * follow is an Interested vote (kind 3): one person can hold several, cast in other spaces, and the
 * permissionless action lets anyone cast one into a space of their choosing. Flag off, it is a
 * `Following` relation, which anyone can write *from* someone else's entity into a space they
 * control. Either way a raw row total would let one person count many times, and no filter can
 * compare two columns, so the rows are read and the rule applied here.
 */
export function topicFollowersQuery(topicIds: readonly string[], interested: boolean, viewerId?: string): string {
  const viewer = viewerId ? normId(viewerId) : null;

  const fields = topicIds.flatMap((id, index) => {
    const topic = normId(id);
    const all = interested
      ? `t${index}: userVotesConnection(
          condition: { ${interestedVoteCondition({ objectId: topic })} }
          first: ${FOLLOWER_ROWS}
        ) { totalCount nodes { userId spaceId } }`
      : `t${index}: relationsConnection(
          filter: { typeId: { is: "${FOLLOWING_PROPERTY}" }, toEntityId: { is: ${JSON.stringify(topic)} } }
          first: ${FOLLOWER_ROWS}
        ) { totalCount nodes { fromEntityId spaceId } }`;
    if (!viewer) return [all];

    // The viewer's own-space follow, exactly: what a topic past the rows read can't answer.
    const mine = interested
      ? `v${index}: userVotesConnection(
          condition: { ${interestedVoteCondition({ objectId: topic, userId: viewer, spaceId: viewer })} }
        ) { totalCount }`
      : `v${index}: relationsConnection(
          filter: {
            typeId: { is: "${FOLLOWING_PROPERTY}" }
            toEntityId: { is: ${JSON.stringify(topic)} }
            fromEntityId: { is: ${JSON.stringify(viewer)} }
            spaceId: { is: ${JSON.stringify(viewer)} }
          }
        ) { totalCount }`;
    return [all, mine];
  });

  return `query {\n${fields.join('\n')}\n}`;
}

export function topicFollowersQueryKey(topicId: string, interested: boolean, viewerId?: string | null) {
  return [
    'topic-followers',
    normId(topicId),
    interested ? 'interested' : 'following',
    viewerId ? normId(viewerId) : null,
  ] as const;
}

/** One topic's followers off its connections; see `topicFollowersQuery` for which rows count. */
export function readTopicFollowers(
  topic: Connection | null | undefined,
  viewer: Connection | null | undefined
): TopicFollowers {
  const viewerIndexed = (viewer?.totalCount ?? 0) > 0;
  if (!topic) return { count: 0, viewerIndexed };

  const nodes = topic.nodes ?? [];
  const followers = new Set<string>();
  for (const row of nodes) {
    const follower = row.userId ?? row.fromEntityId;
    if (follower && normId(follower) === normId(row.spaceId)) followers.add(normId(follower));
  }

  // Past the rows read, the server's total stands in. It can't apply the rule above, so a topic that
  // popular can read a little high; every topic today is far short of it.
  const count = topic.totalCount > nodes.length ? topic.totalCount : followers.size;
  return { count, viewerIndexed };
}

export async function fetchTopicFollowers(
  topicIds: readonly string[],
  interested: boolean,
  viewerId?: string,
  signal?: AbortSignal
): Promise<Map<string, TopicFollowers>> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<Record<string, Connection | null>>({
        query: topicFollowersQuery(topicIds, interested, viewerId),
        endpoint: Environment.getConfig().api,
        signal,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error('[topic-followers] failed to fetch followers:', result.left);
    throw new Error('Failed to fetch topic followers', { cause: result.left });
  }

  const followers = new Map<string, TopicFollowers>();
  topicIds.forEach((id, index) => {
    followers.set(normId(id), readTopicFollowers(result.right[`t${index}`], result.right[`v${index}`]));
  });
  return followers;
}
