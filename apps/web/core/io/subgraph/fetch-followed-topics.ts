import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import type { FollowedTopicRelation } from '~/core/topics/follow-ops';
import { FOLLOWING_PROPERTY } from '~/core/topics/ontology';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

const PAGE_SIZE = 1000;

type NetworkResult = {
  relationsConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: FollowedTopicRelation[];
  };
};

/** Rows authored by the personal-space entity in its own space; anyone can write *from* it elsewhere. */
export function followedTopicsQuery(spaceId: string, after: string | null): string {
  const space = JSON.stringify(spaceId);

  return `query {
    relationsConnection(
      filter: {
        typeId: { is: "${FOLLOWING_PROPERTY}" }
        fromEntityId: { is: ${space} }
        spaceId: { is: ${space} }
      }
      first: ${PAGE_SIZE}
      after: ${JSON.stringify(after)}
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { id spaceId toEntityId }
    }
  }`;
}

/** Normalized so dashed and dashless spellings of one space share a cache entry. */
export function followedTopicsQueryKey(spaceId: string | null | undefined) {
  return ['followed-topics', spaceId ? normId(spaceId) : spaceId] as const;
}

async function fetchPage(
  spaceId: string,
  after: string | null,
  signal?: AbortSignal
): Promise<NetworkResult['relationsConnection']> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: followedTopicsQuery(spaceId, after),
        endpoint: Environment.getConfig().api,
        signal,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`[followed-topics] failed to fetch follows for ${spaceId}:`, result.left);
    throw new Error(`Failed to fetch followed topics for ${spaceId}`, { cause: result.left });
  }

  return result.right.relationsConnection;
}

export async function fetchFollowedTopics(spaceId: string, signal?: AbortSignal): Promise<FollowedTopicRelation[]> {
  const own = normId(spaceId);
  const rows: FollowedTopicRelation[] = [];
  let after: string | null = null;

  do {
    const page = await fetchPage(spaceId, after, signal);
    rows.push(...page.nodes.filter(row => normId(row.spaceId) === own));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return rows;
}
