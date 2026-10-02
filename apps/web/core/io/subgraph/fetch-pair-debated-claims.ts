import { Effect, Either } from 'effect';

import { DEBATE_CLAIMS_PROPERTY_ID } from '~/core/debates/ontology';
import { Environment } from '~/core/environment';
import { DEBATE_OPPOSED_BY_PROPERTY, DEBATE_SUPPORTED_BY_PROPERTY, DEBATE_TYPE } from '~/core/profile/history-ontology';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

type RelationTarget = { typeId: string; toEntityId: string };

interface NetworkResult {
  debates: {
    nodes: { fromEntity: { id: string; relationsList: RelationTarget[] } | null }[];
  } | null;
}

/**
 * One person's debates, each with both of its sides and the claim it argued.
 *
 * Asked from one participant's side and filtered to the other's in the client: the graph cannot
 * join two relations on the same debate, and one person's whole record is a single page (the most
 * active debater on testnet has about twenty).
 *
 * The ids have to be bare hex. `toEntityId` is a UUID filter, but a hyphenated spelling of the same
 * id matches nothing rather than erroring, and geo-chat hands out the hyphenated one.
 */
function pairDebatesQuery(spaceId: string, first: number) {
  const sides = JSON.stringify([DEBATE_SUPPORTED_BY_PROPERTY, DEBATE_OPPOSED_BY_PROPERTY]);
  const wanted = JSON.stringify([DEBATE_SUPPORTED_BY_PROPERTY, DEBATE_OPPOSED_BY_PROPERTY, DEBATE_CLAIMS_PROPERTY_ID]);

  return `query {
    debates: relationsConnection(
      filter: {
        typeId: { in: ${sides} }
        toEntityId: { is: ${JSON.stringify(normId(spaceId))} }
        fromEntity: { typeIds: { overlaps: ["${DEBATE_TYPE}"] } }
      }
      first: ${first}
    ) {
      nodes {
        fromEntity {
          id
          relationsList(first: 50, filter: { typeId: { in: ${wanted} } }) { typeId toEntityId }
        }
      }
    }
  }`;
}

export function pairDebatedClaimsQueryKey(spaceIdA: string, spaceIdB: string) {
  // Either participant can ask, and both should share one cache entry.
  const [first, second] = [normId(spaceIdA), normId(spaceIdB)].sort();
  return ['pair-debated-claims', first, second] as const;
}

/**
 * The claims two people have debated against each other, as canonical (bare hex) claim ids.
 *
 * Read from the published Debate entities, so a debate shows up here only once it has been
 * published — about half an hour after it ends. The lobby covers that gap with a local record; see
 * `usePairDebatedClaims`.
 */
export async function fetchPairDebatedClaims(spaceIdA: string, spaceIdB: string, first = 500): Promise<string[]> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: pairDebatesQuery(spaceIdA, first),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error('[pair-debated-claims] failed to fetch debates:', result.left);
    throw new Error('Failed to fetch debated claims for pair', { cause: result.left });
  }

  const opponent = normId(spaceIdB);
  const sideTypes = new Set([DEBATE_SUPPORTED_BY_PROPERTY, DEBATE_OPPOSED_BY_PROPERTY]);
  const claimIds = new Set<string>();
  // One debate can carry the same side relation more than once (duplicate writes), and the query
  // matches it once per relation, so the same debate can arrive several times.
  const seen = new Set<string>();

  for (const node of result.right.debates?.nodes ?? []) {
    const debate = node.fromEntity;
    if (!debate || seen.has(debate.id)) continue;
    seen.add(debate.id);

    const relations = debate.relationsList;
    const againstOpponent = relations.some(
      relation => sideTypes.has(relation.typeId) && normId(relation.toEntityId) === opponent
    );
    if (!againstOpponent) continue;

    for (const relation of relations) {
      if (relation.typeId === DEBATE_CLAIMS_PROPERTY_ID) claimIds.add(normId(relation.toEntityId));
    }
  }

  return [...claimIds];
}
