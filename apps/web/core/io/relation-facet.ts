import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import type { EntityFilter } from '~/core/gql/graphql';
import { uuidToHex } from '~/core/id/normalize';

/**
 * The one grouped-aggregation query behind every facet menu in the app: the
 * relations of one property, restricted to rows matching a population,
 * grouped — every option id with its exact count in a single request. The
 * debates hub facets (tagged-claims.ts, GEO-2798) and the data-table
 * dropdowns (fetch-dropdown-options.ts) both run exactly this document; the
 * two grew it independently before it was extracted here, and the decoder
 * encodes API facts that must not drift apart between them:
 *
 * - `distinctCount(fromEntityId)` counts DISTINCT rows per group, so a row
 *   carrying duplicate relations to one value counts once — verified equal
 *   to a per-option totalCount on ground truth.
 * - Counts arrive as bigint STRINGS and group keys arrive as dashed UUIDs,
 *   while entity ids everywhere else in the app are dashless — normalized
 *   here, at the one boundary, because the ids leave the menus (they become
 *   selections compared with `Set.has` against dashless relation targets).
 * - The `fromEntity` filter is not optional in practice: an unfiltered
 *   group-by runs over every relation in the graph (4.2M) and is the only
 *   slow path there is. `toEntityId: { is: null }` is a no-op (shipped
 *   behavior — the debates topic facet always sends it).
 */
const RELATION_FACET_SOURCE = /* GraphQL */ `
  query RelationFacet($typeId: UUID!, $toEntityId: UUID, $fromEntity: EntityFilter, $groupBy: [RelationsGroupBy!]!) {
    relationsConnection(filter: { typeId: { is: $typeId }, toEntityId: { is: $toEntityId }, fromEntity: $fromEntity }) {
      groupedAggregates(groupBy: $groupBy) {
        keys
        distinctCount {
          fromEntityId
        }
      }
    }
  }
`;

export type RelationFacetResult = {
  relationsConnection: {
    groupedAggregates: Array<{
      keys: string[] | null;
      distinctCount: { fromEntityId: string | null } | null;
    } | null> | null;
  } | null;
};

/** The group-by dimensions in use; widen when a caller needs another. */
export type RelationFacetGroupBy = 'TO_ENTITY_ID' | 'SPACE_ID';

export type RelationFacetVariables = {
  typeId: string;
  toEntityId: string | null;
  fromEntity: EntityFilter | null;
  groupBy: RelationFacetGroupBy[];
};

export const relationFacetDocument = parse(RELATION_FACET_SOURCE) as TypedDocumentNode<
  RelationFacetResult,
  RelationFacetVariables
>;

/** One facet row: a group's id and how many distinct population rows fall in it. */
export type RelationFacetCount = { id: string; count: number };

/**
 * Facet rows from the raw result: ids normalized to the app's dashless
 * spelling, counts coerced to numbers, server order preserved — ordering is
 * a per-menu decision, not a wire fact.
 */
export function decodeRelationFacet(result: RelationFacetResult): RelationFacetCount[] {
  const counts: RelationFacetCount[] = [];
  for (const group of result.relationsConnection?.groupedAggregates ?? []) {
    const id = group?.keys?.[0];
    if (!id) continue;
    counts.push({ id: uuidToHex(id), count: Number(group?.distinctCount?.fromEntityId ?? 0) });
  }
  return counts;
}
