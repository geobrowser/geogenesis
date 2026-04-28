import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';

interface ParentsQueryResult {
  subspacesConnection: {
    nodes: Array<{ parentSpaceId: string }>;
  };
}

function parentsQuery(childSpaceId: string) {
  return `query getParentRelatedSpaces {
  subspacesConnection(
    filter: { childSpaceId: { is: ${JSON.stringify(childSpaceId)} }, type: { is: RELATED } }
  ) {
    nodes {
      parentSpaceId
    }
  }
}`;
}

/**
 * Direct parent space IDs for a child space via RELATED subspace links only.
 * (Verified / other edge types intentionally excluded for now; may broaden later.)
 */
export async function fetchParentSpaceIds(childSpaceId: string): Promise<string[]> {
  if (!validateSpaceId(childSpaceId)) {
    return [];
  }

  const resultOrError = await Effect.runPromise(
    Effect.either(
      graphql<ParentsQueryResult>({
        query: parentsQuery(childSpaceId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch parent spaces for child ${childSpaceId}`);
        return [];
    }
  }

  const rows = resultOrError.right.subspacesConnection?.nodes ?? [];
  return [...new Set(rows.map(r => r.parentSpaceId).filter(Boolean))];
}

/**
 * `spaceId` first, then its direct parent spaces (one level up), deduped.
 * Parents are discovered only through RELATED subspace rows today; that filter may be lifted later.
 */
export async function fetchSpacesWithAncestors(spaceId: string): Promise<string[]> {
  if (!validateSpaceId(spaceId)) {
    return [];
  }

  const ordered: string[] = [spaceId];
  const directParents = await fetchParentSpaceIds(spaceId);
  for (const parent of directParents) {
    if (parent !== spaceId && !ordered.includes(parent)) ordered.push(parent);
  }
  return ordered;
}
