import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

type RelatedDebates = { relationsConnection: { nodes: Array<{ fromEntityId: string | null }> } };

const document = parse(/* GraphQL */ `
  query ExploreEntryIds($id: UUID!, $spaces: [UUID!]!, $claimProperty: UUID!, $debateType: UUID!) {
    relationsConnection(
      first: 30
      filter: {
        typeId: { is: $claimProperty }
        toEntityId: { is: $id }
        spaceId: { in: $spaces }
        fromEntity: { typeIds: { overlaps: [$debateType] } }
      }
    ) {
      nodes {
        fromEntityId
      }
    }
  }
`) as TypedDocumentNode<RelatedDebates, { id: string; spaces: string[]; claimProperty: string; debateType: string }>;

/** Resolve the bounded candidate set through indexed relations before loading normal feed cards.
 * An entity-id OR a reverse-relation predicate on entitiesConnection makes the graph scan the
 * entity population; the marketing debate in GEO-3560 timed out even though its ID read took <1s.
 */
export async function fetchExploreEntryIds(id: string, spaces: string[]): Promise<string[]> {
  if (spaces.length === 0) return [id];
  const related = await Effect.runPromise(
    graphql({
      query: document,
      variables: { id, spaces, claimProperty: DEBATE_CLAIMS_PROPERTY_ID, debateType: DEBATE_TYPE_ID },
      decoder: data =>
        data.relationsConnection.nodes.flatMap(node => (node.fromEntityId ? [normId(node.fromEntityId)] : [])),
    })
  );
  return [...new Set([normId(id), ...related])];
}
