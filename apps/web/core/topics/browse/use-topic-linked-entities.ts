'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
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
 * Newest first. The ranked "Best" order would be the better sequence and cannot be used: a
 * topic-filtered ranked query returns rows in id order and takes ~17s (GEO-2720). Recency is the
 * honest fallback until that is fixed.
 */
export function useTopicLinkedEntities({
  topicId,
  typeIds,
  first,
  after,
  enabled = true,
}: {
  topicId: string;
  /** Narrows to these types. Omit for everything that names the topic. */
  typeIds?: string[];
  first: number;
  after?: string;
  enabled?: boolean;
}) {
  const where = React.useMemo(
    () => ({
      ...(typeIds && typeIds.length > 0 ? { types: typeIds.map(id => ({ id: { equals: id } })) } : {}),
      relations: [{ typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { equals: topicId } } }],
    }),
    [topicId, typeIds]
  );

  const { entities, isLoading, isPlaceholderData, endCursor, hasNextPage } = useQueryEntities({
    where,
    first,
    after,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    // Holds the page being read while the next one loads, so stepping doesn't collapse the section
    // and shift everything below it — the same reason the claim page's lists do this.
    placeholderData: keepPreviousData,
    enabled,
  });

  return { entities: entities as Entity[], isLoading, isPlaceholderData, endCursor, hasNextPage };
}

/** The first type with a name, which is what a row shows as its kind. */
export function primaryTypeName(entity: Entity): string | null {
  return entity.types.find(type => type.name)?.name ?? null;
}
