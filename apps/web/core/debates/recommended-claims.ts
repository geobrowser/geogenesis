'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';

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
export function useRecommendedClaimSections(participantSpaceIds: string[]): RecommendedClaimSection[] {
  const enabled = participantSpaceIds.length > 0;

  const { entities: pages } = useQueryEntities({
    where: { types: [{ id: { equals: RECOMMENDED_CLAIMS_TYPE_ID } }] },
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

  const { entities: blocks } = useQueryEntities({
    where: { id: { in: blockIds } },
    first: 100,
    enabled: blockIds.length > 0,
  });

  return React.useMemo(() => {
    const byId = new Map(blocks.map(block => [block.id, block]));

    return blockIds
      .map(blockId => {
        const block = byId.get(blockId);
        if (!block) return null;

        const claimIds = block.relations
          .filter(
            relation => relation.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE && relation.isDeleted !== true
          )
          .slice()
          .sort(byPosition)
          .map(relation => relation.toEntity.id);

        // A block with nothing in it would render as an empty heading.
        if (claimIds.length === 0) return null;

        return { id: block.id, name: block.name ?? 'Recommended', claimIds };
      })
      .filter((section): section is RecommendedClaimSection => section !== null);
  }, [blockIds, blocks]);
}

/** Blocks and collection items both carry a fractional index; absent, they fall to the end. */
function byPosition(a: { position?: string }, z: { position?: string }) {
  return (a.position ?? '').localeCompare(z.position ?? '');
}
