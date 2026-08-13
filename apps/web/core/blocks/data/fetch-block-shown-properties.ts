import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Entity } from '~/core/types';

/**
 * The property entities behind every column a page's blocks show.
 *
 * Only Image/Video properties end up mattering — a gallery sizes its cards from the Width
 * (pixels) / Height (pixels) values on them — but which shown column holds the media is only
 * knowable from the property schema, which is a separate request the client makes later.
 * Waiting for that chain means the gallery lays itself out at the default 2:1 ratio and then
 * reflows the whole grid once the real dimensions arrive.
 *
 * Fetching all of them here is one batched call on a page the server is already assembling, and
 * it means the very first paint — server-rendered included — knows the card ratio.
 *
 * Pass the block entities *and* their BLOCKS relation entities: the shown-column relations live
 * on the relation, not the block.
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
    for (const relation of block.relations ?? []) {
      const isShownColumn = relation.type.id === SystemIds.PROPERTIES || relation.type.id === SystemIds.SHOWN_COLUMNS;
      if (!isShownColumn || relation.isDeleted) continue;

      const propertyId = relation.toEntity.id;
      if (propertyId && !alreadyFetched.has(propertyId)) propertyIds.add(propertyId);
    }
  }

  if (propertyIds.size === 0) return [];

  return fetchBatch([...propertyIds]);
}
