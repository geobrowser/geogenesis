import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { type InterestedTopicRow, interestedVoteCondition } from '~/core/topics/interested';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

const PAGE_SIZE = 1000;

type NetworkResult = {
  userVotesConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: InterestedTopicRow[];
  };
};

/**
 * The entities a space currently holds Interested on (GEO-3158): vote kind 3, vote type 0. A
 * cleared Interested is a row rewritten to vote type 2, so the condition excludes it. Every space
 * the Interested was cast in, because clearing has to name it.
 */
export function interestedTopicsQuery(spaceId: string, after: string | null): string {
  return `query {
    userVotesConnection(
      condition: { ${interestedVoteCondition({ userId: spaceId })} }
      first: ${PAGE_SIZE}
      after: ${JSON.stringify(after)}
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { objectId spaceId }
    }
  }`;
}

/** Normalized so dashed and dashless spellings of one space share a cache entry. */
export function interestedTopicsQueryKey(spaceId: string | null | undefined) {
  return ['interested-topics', spaceId ? normId(spaceId) : spaceId] as const;
}

async function fetchPage(
  spaceId: string,
  after: string | null,
  signal?: AbortSignal
): Promise<NetworkResult['userVotesConnection']> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: interestedTopicsQuery(spaceId, after),
        endpoint: Environment.getConfig().api,
        signal,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`[interested-topics] failed to fetch Interested for ${spaceId}:`, result.left);
    throw new Error(`Failed to fetch Interested topics for ${spaceId}`, { cause: result.left });
  }

  return result.right.userVotesConnection;
}

export async function fetchInterestedTopics(spaceId: string, signal?: AbortSignal): Promise<InterestedTopicRow[]> {
  const rows: InterestedTopicRow[] = [];
  let after: string | null = null;

  do {
    const page = await fetchPage(spaceId, after, signal);
    rows.push(...page.nodes.map(row => ({ objectId: normId(row.objectId), spaceId: normId(row.spaceId) })));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return rows;
}
