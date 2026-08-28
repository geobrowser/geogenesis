'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { sortClaimsByBest, useClaimsBestOrder } from '~/core/debates/claims-best-order';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

/**
 * Entities that name this topic, one page at a time.
 *
 * Everything on a topic page hangs off the same relation: `Topics` points *at* the topic, so every
 * section here is the same query narrowed by the type of thing doing the pointing. Claims, episodes,
 * news stories, tweets and official documents all arrive this way.
 *
 * Ranked by the explore feed's "Best" order, applied to each page.
 *
 * Within the page, not across the corpus: asking the ranked connection for a topic-filtered set
 * returns rows in id order and takes ~17s (GEO-2720), so the ranking can only be applied to ids
 * already in hand. `claims-best-order` does exactly that, and works on any entity rather than only
 * claims — anything the feed has scored ranks, and anything it hasn't keeps the server's order
 * behind the scored ones.
 *
 * A page is only handed back once its ranking is known. The rows and the ranking are two requests,
 * and returning on the first would show a page in the server's order and resequence it under the
 * reader a moment later — the bug this same pattern fixed on the claim page.
 */
export function useTopicLinkedEntities({
  topicId,
  typeIds,
  first,
  after,
  enabled = true,
  rankInSpaceId,
}: {
  topicId: string;
  /** Narrows to these types. Omit for everything that names the topic. */
  typeIds?: string[];
  first: number;
  after?: string;
  enabled?: boolean;
  /** The space the ranking is read in. Ranking is space-scoped; omit to leave the page unranked. */
  rankInSpaceId?: string | null;
}) {
  const where = React.useMemo(
    () => ({
      ...(typeIds && typeIds.length > 0 ? { types: typeIds.map(id => ({ id: { equals: id } })) } : {}),
      relations: [{ typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { equals: topicId } } }],
    }),
    [topicId, typeIds]
  );

  const {
    entities: page,
    isLoading,
    isPlaceholderData,
    endCursor,
    hasNextPage,
  } = useQueryEntities({
    where,
    first,
    after,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    // Holds the page being read while the next one loads, so stepping doesn't collapse the section
    // and shift everything below it — the same reason the claim page's lists do this.
    placeholderData: keepPreviousData,
    enabled,
  });

  const pageIds = React.useMemo(() => page.map(entity => entity.id), [page]);
  const { rankByClaimId, isReady: isRankReady } = useClaimsBestOrder(
    rankInSpaceId ? pageIds : [],
    rankInSpaceId ?? null
  );
  const ordered = React.useMemo(() => sortClaimsByBest(page as Entity[], rankByClaimId), [page, rankByClaimId]);

  const [committed, setCommitted] = React.useState<Entity[]>([]);
  React.useEffect(() => {
    if (!isRankReady) return;
    setCommitted(current => (sameOrder(current, ordered) ? current : ordered));
  }, [isRankReady, ordered]);

  return {
    entities: committed,
    /** The page as fetched, before ranking — for callers asking "did this page hold anything". */
    rawEntities: page as Entity[],
    isLoading: isLoading || !isRankReady,
    isPlaceholderData,
    endCursor,
    hasNextPage,
  };
}

/** Whether two pages hold the same rows in the same sequence, so state isn't replaced needlessly. */
function sameOrder(left: Entity[], right: Entity[]) {
  return left.length === right.length && left.every((entity, index) => entity.id === right[index]?.id);
}

/** The first type with a name, which is what a row shows as its kind. */
export function primaryTypeName(entity: Entity): string | null {
  return entity.types.find(type => type.name)?.name ?? null;
}
