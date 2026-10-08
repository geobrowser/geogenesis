import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { interestedVoteCondition } from '~/core/topics/interested';
import { FOLLOWING_PROPERTY } from '~/core/topics/ontology';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

/** Relation rows read per topic with the flag off; see `topicFollowersQuery`. */
const FOLLOWING_ROWS = 1000;

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

type Connection = {
  totalCount: number;
  nodes?: { fromEntityId: string; spaceId: string }[];
};

/**
 * One aliased connection per topic, so a feed's worth of cards is one request.
 *
 * Flag on, a follow is an Interested vote (kind 3, type 0), one per follower: each is cast in the
 * follower's own personal space, so the per-space vote counts table can't total them, but the
 * connection's `totalCount` can. A second, viewer-scoped count says whether the viewer is in it.
 *
 * Flag off, a follow is a `Following` relation, and only one written by a personal space in its own
 * space counts, the rule the viewer's own follows are read by: anyone can write a relation *from*
 * someone else's entity into a space they control. No filter can compare two columns, so those rows
 * are read and checked here. That path is the legacy one, with a handful of rows in all.
 */
export function topicFollowersQuery(topicIds: readonly string[], interested: boolean, viewerId?: string): string {
  const fields = topicIds.flatMap((id, index) =>
    interested
      ? [
          `t${index}: userVotesConnection(condition: { ${interestedVoteCondition({ objectId: normId(id) })} }) { totalCount }`,
          ...(viewerId
            ? [
                `v${index}: userVotesConnection(condition: { ${interestedVoteCondition({ objectId: normId(id), userId: normId(viewerId) })} }) { totalCount }`,
              ]
            : []),
        ]
      : [
          `t${index}: relationsConnection(
            filter: { typeId: { is: "${FOLLOWING_PROPERTY}" }, toEntityId: { is: ${JSON.stringify(normId(id))} } }
            first: ${FOLLOWING_ROWS}
          ) { totalCount nodes { fromEntityId spaceId } }`,
        ]
  );

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
  viewer: Connection | null | undefined,
  viewerId?: string
): TopicFollowers {
  if (!topic) return { count: 0, viewerIndexed: false };
  if (!topic.nodes) return { count: topic.totalCount, viewerIndexed: (viewer?.totalCount ?? 0) > 0 };

  const followers = new Set<string>();
  for (const row of topic.nodes) {
    if (normId(row.fromEntityId) === normId(row.spaceId)) followers.add(normId(row.fromEntityId));
  }
  // Past the rows read, the server's total stands in: it can't apply the own-space rule.
  const count = topic.totalCount > topic.nodes.length ? topic.totalCount : followers.size;
  return { count, viewerIndexed: viewerId ? followers.has(normId(viewerId)) : false };
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
    followers.set(normId(id), readTopicFollowers(result.right[`t${index}`], result.right[`v${index}`], viewerId));
  });
  return followers;
}
