import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { DEBATE_OPPOSED_BY_PROPERTY, DEBATE_SUPPORTED_BY_PROPERTY, DEBATE_TYPE } from '~/core/profile/history-ontology';
import type { HiddenProfileRelation } from '~/core/profile/profile-debate-visibility';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';
import { hiddenProfileRelationRowsConnection } from './hidden-profile-relations-query';

/** One debate a person argued, and which side they took. */
export type PersonDebate = {
  /** The debate entity id, which is also its id in geo-chat. */
  id: string;
  name: string | null;
  /** Where the debate lives, for the space filter. */
  spaceId: string | null;
  side: 'supported' | 'opposed';
  /** Unix seconds, for ordering. Zero where the indexer stamped none. */
  createdAt: number;
  /** Every live hide row for this debate in this person's personal space. */
  hiddenRelations: HiddenProfileRelation[];
};

type RelationNode = {
  typeId: string;
  spaceId: string | null;
  fromEntity: { id: string; name: string | null; createdAt: string | null } | null;
};

interface NetworkResult {
  supported: { nodes: RelationNode[] } | null;
  opposed: { nodes: RelationNode[] } | null;
  hidden: { nodes: HiddenProfileRelation[] } | null;
}

/**
 * The debates a person argued, read from the graph.
 *
 * geo-chat cannot answer this: it indexes DAO spaces only, so
 * `list_space_debates` on a personal space returns `space_not_found`. The graph
 * does know, because a debate names its two participants with a relation — and
 * **those relations point at the participant's space, not their person entity**,
 * which returns an empty list rather than an error if you assume otherwise.
 *
 * Both sides are unioned. There is a `Participants` property meant for exactly
 * this, but it covers a fraction of debates; `Supported by` and `Opposed by`
 * cover them all, at the cost of asking twice and merging.
 */
function personDebatesQuery(spaceId: string, first: number) {
  const sp = JSON.stringify(spaceId);
  const side = (typeId: string) => `relationsConnection(
      filter: {
        typeId: { is: "${typeId}" }
        toEntityId: { is: ${sp} }
        fromEntity: { typeIds: { overlaps: ["${DEBATE_TYPE}"] } }
      }
      first: ${first}
    ) {
      nodes { typeId spaceId fromEntity { id name createdAt } }
    }`;

  return `query {
    supported: ${side(DEBATE_SUPPORTED_BY_PROPERTY)}
    opposed: ${side(DEBATE_OPPOSED_BY_PROPERTY)}
    hidden: ${hiddenProfileRelationRowsConnection(spaceId)}
  }`;
}

export function personDebatesQueryKey(spaceId: string) {
  return ['person-debates', spaceId] as const;
}

export async function fetchPersonDebates(spaceId: string, first = 200): Promise<PersonDebate[]> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: personDebatesQuery(spaceId, first),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`[person-debates] failed to fetch debates for ${spaceId}:`, result.left);
    throw new Error(`Failed to fetch debates for ${spaceId}`, { cause: result.left });
  }

  // Relations are not debates. One debate can carry three `Supported by` rows to
  // the same person — duplicate writes, not somebody arguing three times — so a
  // page of relations can hold fewer debates than it has rows. Keyed by debate.
  const byDebate = new Map<string, PersonDebate>();
  const hiddenByDebate = new Map<string, HiddenProfileRelation[]>();

  for (const relation of result.right.hidden?.nodes ?? []) {
    const key = normId(relation.toEntityId);
    hiddenByDebate.set(key, [...(hiddenByDebate.get(key) ?? []), relation]);
  }

  const collect = (nodes: RelationNode[], side: PersonDebate['side']) => {
    for (const node of nodes) {
      const debate = node.fromEntity;
      if (!debate || byDebate.has(debate.id)) continue;

      byDebate.set(debate.id, {
        id: debate.id,
        name: debate.name,
        spaceId: node.spaceId,
        side,
        createdAt: Number(debate.createdAt ?? 0),
        hiddenRelations: hiddenByDebate.get(normId(debate.id)) ?? [],
      });
    }
  };

  // Supported first, so a debate carrying both relations to one person — which
  // should not happen and does — resolves to one side rather than flickering.
  collect(result.right.supported?.nodes ?? [], 'supported');
  collect(result.right.opposed?.nodes ?? [], 'opposed');

  // Newest first.
  //
  // The two collections are read in sequence, so without this the list was every
  // debate they supported followed by every one they opposed — grouped by the
  // side they happened to take, in whatever order the index answered in. That is
  // not an order a reader can see, and it put a two-year-old debate above last
  // week's.
  //
  // Sorted here rather than asked for: the relations carry no useful order of
  // their own, the date wanted is the *debate's* rather than the relation's, and
  // the whole list arrives in one request — the most active debater in the graph
  // has eleven — so this is exact rather than a sort of the page in hand.
  return [...byDebate.values()].sort((a, b) => b.createdAt - a.createdAt);
}
