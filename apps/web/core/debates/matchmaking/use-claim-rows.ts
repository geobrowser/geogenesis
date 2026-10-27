'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import { useClaimEntitiesByIds } from '../claim-picker-page';
import { useClaimOrderFacts } from './claim-order-facts';
import { claimRowKey } from './claim-row-key';
import { type ClaimRowSort, type SortableClaimRow, sortClaimRows } from './hub-filters';
import { claimTopicsById, countBy, keepSelectedVisible, orderFacetOptions, topicsFor } from './topic-facets';
import { useStableListOrder } from './use-stable-list-order';

type PlacedClaimRow = SortableClaimRow & { claim: { space_id: string } };

/**
 * A claim list in the order to draw it, held so rows the viewer has already seen stay put.
 *
 * Unsorted, it is the source's order under the usual hold. Under a client Sort (GEO-3463) the rows
 * are sorted *before* the hold, with the Sort in its key, so changing the Sort re-sorts and nothing
 * else does: a live count changing, or a page arriving. `appendNew` puts a new page's rows after the
 * ones already placed, for a list that pages. A row whose order facts have not landed waits at the
 * end, unplaced, and is placed with its own page once they do.
 */
export function useHeldClaimRows<T extends PlacedClaimRow>(
  rows: T[],
  sort: ClaimRowSort | undefined,
  resetKey: string,
  { appendNew = false }: { appendNew?: boolean } = {}
): T[] {
  const needsFacts = sort === 'best' || sort === 'newest';
  const { facts } = useClaimOrderFacts(
    React.useMemo(() => rows.map(row => row.claim.claim_entity_id), [rows]),
    needsFacts
  );

  const { placeable, waiting } = React.useMemo(() => {
    if (!sort) return { placeable: rows, waiting: [] as T[] };
    const sorted = sortClaimRows(rows, sort, facts);
    if (!needsFacts) return { placeable: sorted, waiting: [] as T[] };
    const known = (row: T) => facts.has(normId(row.claim.claim_entity_id));
    return { placeable: sorted.filter(known), waiting: sorted.filter(row => !known(row)) };
  }, [facts, needsFacts, rows, sort]);

  const held = useStableListOrder(placeable, claimRowKey, sort ? `${resetKey}|${sort}` : resetKey, {
    appendNew: appendNew && sort !== undefined,
  });
  return React.useMemo(() => (waiting.length > 0 ? [...held, ...waiting] : held), [held, waiting]);
}

/**
 * Topics for claim rows in hand, from their claim entities: geo-chat's rows carry none (GEO-2861).
 * `isLoading` and `error` say whether a topic filter can be honoured yet.
 */
export function useClaimRowTopics(rows: PlacedClaimRow[]) {
  const { entities, isLoading, error } = useClaimEntitiesByIds(
    React.useMemo(() => rows.map(row => row.claim.claim_entity_id), [rows])
  );
  const topicsByClaimId = React.useMemo(() => claimTopicsById(entities), [entities]);
  return { topicsByClaimId, isLoading, error };
}

/**
 * The topic menu over rows in hand: counted off the rows, so it is co-occurrence when they already
 * carry the picks, with each pick kept on it to be unpicked, picks first.
 */
export function useRowTopicFacet(
  rows: PlacedClaimRow[],
  topicsByClaimId: ReturnType<typeof claimTopicsById>,
  topicIds: string[]
) {
  return React.useMemo(
    () =>
      orderFacetOptions(
        keepSelectedVisible(
          countBy(rows.flatMap(row => topicsFor(topicsByClaimId, row.claim.claim_entity_id, row.claim.space_id) ?? [])),
          topicIds
        ),
        topicIds
      ),
    [rows, topicIds, topicsByClaimId]
  );
}
