import { ID } from '~/core/id';
import type { Value } from '~/core/types';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';

/**
 * One Blocks relation entity considered for the backfill, as read from the graph.
 */
export type ExploreBlockRelation = {
  /** The Blocks relation entity — the one carrying View and Properties. */
  relationEntityId: string;
  spaceId: string;
  view: string;
  hasInfiniteScrollValue: boolean;
};

export type ExploreInfiniteScrollBackfillItem = {
  relationEntityId: string;
  spaceId: string;
  propertyId: string;
  value: string;
};

export type ExploreInfiniteScrollBackfillPlan = {
  bySpace: { spaceId: string; items: ExploreInfiniteScrollBackfillItem[] }[];
  skipped: { relationEntityId: string; reason: 'not-explore' | 'already-set' | 'incomplete' }[];
};

export function buildExploreInfiniteScrollBackfillValues(items: readonly ExploreInfiniteScrollBackfillItem[]): Value[] {
  return items.map(item => ({
    id: ID.createValueId({
      entityId: item.relationEntityId,
      propertyId: item.propertyId,
      spaceId: item.spaceId,
    }),
    entity: { id: item.relationEntityId, name: null },
    property: { id: item.propertyId, name: 'Infinite scroll', dataType: 'BOOLEAN' },
    spaceId: item.spaceId,
    value: item.value,
    isLocal: true,
    hasBeenPublished: false,
  }));
}

/**
 * Plans the Infinite scroll stamp for Explore blocks that predate the property.
 */
export function buildExploreInfiniteScrollBackfillPlan(
  relations: readonly ExploreBlockRelation[]
): ExploreInfiniteScrollBackfillPlan {
  const bySpaceId = new Map<string, ExploreInfiniteScrollBackfillItem[]>();
  const skipped: ExploreInfiniteScrollBackfillPlan['skipped'] = [];

  for (const relation of relations) {
    if (!relation.relationEntityId || !relation.spaceId) {
      skipped.push({ relationEntityId: relation.relationEntityId, reason: 'incomplete' });
      continue;
    }

    if (relation.view !== 'EXPLORE') {
      skipped.push({ relationEntityId: relation.relationEntityId, reason: 'not-explore' });
      continue;
    }

    // Any existing value is left alone, including an explicit `false`.
    if (relation.hasInfiniteScrollValue) {
      skipped.push({ relationEntityId: relation.relationEntityId, reason: 'already-set' });
      continue;
    }

    const items = bySpaceId.get(relation.spaceId) ?? [];
    items.push({
      relationEntityId: relation.relationEntityId,
      spaceId: relation.spaceId,
      propertyId: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID,
      value: '1',
    });
    bySpaceId.set(relation.spaceId, items);
  }

  return {
    bySpace: [...bySpaceId.entries()].map(([spaceId, items]) => ({ spaceId, items })),
    skipped,
  };
}
