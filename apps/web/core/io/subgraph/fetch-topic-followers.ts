import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { INTERESTED_VOTE_KIND } from '~/core/topics/interested';
import { FOLLOWING_PROPERTY } from '~/core/topics/ontology';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

/** Rows read per topic. Past this the count falls back to the connection's `totalCount`. */
const FOLLOWER_ROWS = 1000;

/**
 * Who follows a topic: the personal spaces holding a follow on it, and how many there are.
 *
 * `followerIds` is what lets a control draw its own follow before the indexer has it: the count it
 * shows is the others plus the viewer, whatever the indexer has caught up to.
 */
export type TopicFollowers = {
  followerIds: string[];
  count: number;
};

type Row = { fromEntityId?: string; spaceId?: string; userId?: string };
type Connection = { totalCount: number; nodes: Row[] };

/**
 * One aliased connection per topic, so a feed's worth of cards is one request.
 *
 * With the Interested-follow flag on, a follow is an Interested vote (kind 3, type 0) and each one
 * is cast in the follower's own personal space, so the per-space vote counts table can't total
 * them: the rows are counted instead. Flag off, a follow is a `Following` relation, and only one
 * written by a personal space in its own space counts, the same rule the viewer's own follows read
 * by — anyone can write a relation *from* someone else's entity into a space they control.
 */
export function topicFollowersQuery(topicIds: readonly string[], interested: boolean): string {
  const fields = topicIds.map((id, index) => {
    const topic = JSON.stringify(normId(id));
    return interested
      ? `t${index}: userVotesConnection(
          condition: { objectId: ${topic}, voteKind: ${INTERESTED_VOTE_KIND}, voteType: 0, objectType: 0 }
          first: ${FOLLOWER_ROWS}
        ) { totalCount nodes { userId } }`
      : `t${index}: relationsConnection(
          filter: { typeId: { is: "${FOLLOWING_PROPERTY}" }, toEntityId: { is: ${topic} } }
          first: ${FOLLOWER_ROWS}
        ) { totalCount nodes { fromEntityId spaceId } }`;
  });

  return `query {\n${fields.join('\n')}\n}`;
}

export function topicFollowersQueryKey(topicId: string, interested: boolean) {
  return ['topic-followers', normId(topicId), interested ? 'interested' : 'following'] as const;
}

/** Distinct followers off one connection; see `topicFollowersQuery` for which rows count. */
export function readTopicFollowers(connection: Connection | null | undefined, interested: boolean): TopicFollowers {
  if (!connection) return { followerIds: [], count: 0 };

  const ids = new Set<string>();
  for (const row of connection.nodes) {
    if (interested) {
      if (row.userId) ids.add(normId(row.userId));
    } else if (row.fromEntityId && row.spaceId && normId(row.fromEntityId) === normId(row.spaceId)) {
      ids.add(normId(row.fromEntityId));
    }
  }

  const followerIds = [...ids];
  // A topic with more rows than were read is counted by the server, which can't apply the dedupe.
  const count = connection.totalCount > connection.nodes.length ? connection.totalCount : followerIds.length;
  return { followerIds, count };
}

export async function fetchTopicFollowers(
  topicIds: readonly string[],
  interested: boolean,
  signal?: AbortSignal
): Promise<Map<string, TopicFollowers>> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<Record<string, Connection | null>>({
        query: topicFollowersQuery(topicIds, interested),
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
    followers.set(normId(id), readTopicFollowers(result.right[`t${index}`], interested));
  });
  return followers;
}
