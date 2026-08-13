'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

/** A curated "Recommended claims" page: claims a curator has picked out for a specific pairing. */
export const RECOMMENDED_CLAIMS_TYPE_ID = '2f8a7be40c5242368bac78511bf0b47f';

/** Points at the personal space entity of each debater the page is curated for. */
export const RECOMMENDED_CLAIMS_PARTICIPANTS_PROPERTY_ID = '7169d65aa8b94addb6cc23c19c9fc0dd';

/**
 * Only pages curated in one of these spaces count. The type alone isn't a permission: anyone could
 * publish an entity of it, and a recommendation is only worth surfacing if we trust its source.
 */
export const RECOMMENDED_CLAIMS_SPACE_IDS = [
  // Adam
  '8a4955bcd9d0fc0d8613f17f01de3b9f',
  // Preston
  'f3dab79cb5a3d9d1759656dd5361d1c6',
];

/** One data block from a recommended page — a named group of claims. */
export type RecommendedClaimSection = {
  id: string;
  name: string;
  claimIds: string[];
};

/**
 * The curated claim groups for a pair of debaters, in page order.
 *
 * A page qualifies when it is one of the curated spaces' `Recommended claims` entities and its
 * `Participants` cover *every* debater in the session — a page curated for a different pairing
 * that happens to include one of them isn't a recommendation for this debate.
 *
 * Two round trips by necessity: the page carries its blocks as relations, but a block's claims
 * live on the block entity, which has to be fetched in turn.
 */
export function useRecommendedClaimSections(participantSpaceIds: string[]): {
  sections: RecommendedClaimSection[];
  /** The claims themselves, so callers don't fetch what this already resolved. */
  claimEntities: Entity[];
  /**
   * True until every stage has settled. Empty sections mean "nothing recommended" only once this
   * is false — before then they only mean "still looking", and a caller that can't tell the two
   * apart will show the wrong tab and then move it under the viewer.
   */
  isLoading: boolean;
} {
  const enabled = participantSpaceIds.length > 0;

  const { entities: pages, isLoading: pagesLoading } = useQueryEntities({
    // Scoped to the curated spaces in the query, not after it: anyone can publish this type, and a
    // hundred unrelated entities would otherwise fill the page and crowd a real one out.
    // One branch per space rather than one `spaces` array — a multi-id space filter matches
    // nothing, where a single-id one matches as expected.
    where: {
      types: [{ id: { equals: RECOMMENDED_CLAIMS_TYPE_ID } }],
      OR: RECOMMENDED_CLAIMS_SPACE_IDS.map(spaceId => ({ spaces: [{ equals: spaceId }] })),
    },
    first: 100,
    enabled,
  });

  // Block ids in page order, from every page curated for this exact set of debaters.
  const blockIds = React.useMemo(() => {
    if (!enabled) return [];

    return pages
      .filter(page => page.spaces.some(spaceId => RECOMMENDED_CLAIMS_SPACE_IDS.some(id => ID.equals(id, spaceId))))
      .filter(page => {
        const participants = page.relations
          .filter(
            relation => relation.type.id === RECOMMENDED_CLAIMS_PARTICIPANTS_PROPERTY_ID && relation.isDeleted !== true
          )
          .map(relation => relation.toEntity.id);

        return participantSpaceIds.every(spaceId => participants.some(participant => ID.equals(participant, spaceId)));
      })
      .flatMap(page =>
        page.relations
          .filter(relation => relation.type.id === SystemIds.BLOCKS && relation.isDeleted !== true)
          .slice()
          .sort(byPosition)
          .map(relation => relation.toEntity.id)
      );
  }, [enabled, pages, participantSpaceIds]);

  const { entities: blocks, isLoading: blocksLoading } = useQueryEntities({
    where: { id: { in: blockIds } },
    first: 100,
    enabled: blockIds.length > 0,
  });

  // Item ids per block, in block order. These are whatever the curator collected — a collection
  // can hold anything, so what they *are* isn't known until they're fetched.
  const itemIdsByBlock = React.useMemo(() => {
    const byId = new Map(blocks.map(block => [block.id, block]));

    return blockIds.flatMap(blockId => {
      const block = byId.get(blockId);
      if (!block) return [];

      const itemIds = block.relations
        .filter(relation => relation.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE && relation.isDeleted !== true)
        .slice()
        .sort(byPosition)
        .map(relation => relation.toEntity.id);

      return [{ id: block.id, name: block.name ?? 'Recommended', itemIds }];
    });
  }, [blockIds, blocks]);

  const itemIds = React.useMemo(() => [...new Set(itemIdsByBlock.flatMap(block => block.itemIds))], [itemIdsByBlock]);

  const { entities: items, isLoading: itemsLoading } = useQueryEntities({
    where: { id: { in: itemIds } },
    first: 100,
    enabled: itemIds.length > 0,
  });

  const claimEntities = React.useMemo(
    () => items.filter(item => item.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID))),
    [items]
  );

  const sections = React.useMemo(() => {
    // A collection can hold anything the curator dropped in it, but this tab feeds a claim picker:
    // anything that isn't a claim has no side to take and no debate to request.
    const claimIds = new Set(claimEntities.map(claim => claim.id));

    return (
      itemIdsByBlock
        .map(block => ({ id: block.id, name: block.name, claimIds: block.itemIds.filter(id => claimIds.has(id)) }))
        // A block holding no claims would render as a heading over nothing.
        .filter(section => section.claimIds.length > 0)
    );
  }, [claimEntities, itemIdsByBlock]);

  // Each stage feeds the next, so any of them still running means the answer isn't in yet.
  const isLoading =
    enabled && (pagesLoading || (blockIds.length > 0 && blocksLoading) || (itemIds.length > 0 && itemsLoading));

  return React.useMemo(() => ({ sections, claimEntities, isLoading }), [claimEntities, isLoading, sections]);
}

/** Blocks and collection items both carry a fractional index; absent, they fall to the end. */
function byPosition(a: { position?: string }, z: { position?: string }) {
  // An empty string sorts before every real position, so absent has to be handled on its own
  // rather than defaulted — otherwise "falls to the end" would put it first.
  if (a.position === undefined || z.position === undefined) {
    return Number(a.position === undefined) - Number(z.position === undefined);
  }
  return a.position.localeCompare(z.position);
}
