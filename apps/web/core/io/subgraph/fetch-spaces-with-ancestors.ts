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
 * `spaceId` first, then every ancestor parent space (breadth-first), deduped.
 * Ancestors are discovered only through RELATED subspace rows today; that filter may be lifted later.
 */
export async function fetchSpacesWithAncestors(spaceId: string): Promise<string[]> {
  if (!validateSpaceId(spaceId)) {
    return [];
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  let frontier: string[] = [spaceId];

  for (let depth = 0; depth < 20 && frontier.length > 0; depth++) {
    const wave = [...new Set(frontier.filter(id => validateSpaceId(id)))];
    const parentLists = await Promise.all(wave.map(id => fetchParentSpaceIds(id)));

    for (const id of wave) {
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }

    const nextFrontier: string[] = [];
    for (const parents of parentLists) {
      for (const p of parents) {
        if (!seen.has(p)) nextFrontier.push(p);
      }
    }

    frontier = [...new Set(nextFrontier)];
  }

  return ordered;
}
