import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { Entity } from '~/core/types';

import { dataBlockViewFromRelations } from './data-block-view';
import { shownColumnIdsForBlock } from './read-block-media-dimensions';

/**
 * The property entities behind the columns a page's *gallery* blocks show.
 *
 * The gallery is the only view that sizes itself from a property's Width (pixels) / Height
 * (pixels), and those live on the property entity, which nothing else on the page fetches. Which
 * shown column holds the media is only knowable from the property schema — a separate request the
 * client makes later — so we fetch the block's columns rather than trying to pick one here.
 * Waiting for that chain is what makes a gallery lay itself out at the default 2:1 ratio and then
 * reflow the whole grid once the real dimensions arrive.
 *
 * Fetching them is one batched call on a page the server is already assembling, and it means the
 * very first paint — server-rendered included — knows the card ratio.
 *
 * Pass the block entities *and* their BLOCKS relation entities: the view and the shown-column
 * relations both live on the relation, not the block.
 *
 * Deliberately unscoped by space, unlike everything else the page fetches. A property is defined
 * in whatever space owns it — Debate videos lives in the debates ontology space, not in the space
 * of any page that shows it — and the batch query scopes both the entity lookup and its values to
 * the space passed in. Hand it the page's space and this returns nothing at all.
 */
export async function fetchShownPropertyEntitiesForBlocks(
  blocks: Entity[],
  fetchBatch: (ids: string[], spaceId?: string) => Promise<Entity[]>
): Promise<Entity[]> {
  const alreadyFetched = new Set(blocks.map(block => block.id));
  const propertyIds = new Set<string>();

  for (const block of blocks) {
    if (dataBlockViewFromRelations(block.relations) !== 'GALLERY') continue;

    for (const propertyId of shownColumnIdsForBlock(block)) {
      // Name is implicit in every block and never holds media.
      if (ID.equals(propertyId, SystemIds.NAME_PROPERTY)) continue;
      if (alreadyFetched.has(propertyId)) continue;

      propertyIds.add(propertyId);
    }
  }

  if (propertyIds.size === 0) return [];

  return fetchBatch([...propertyIds]);
}
