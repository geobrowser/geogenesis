import { Entity } from '~/core/types';

import { getCollectionItemIds } from './get-collection-item-ids';

export async function fetchCollectionItemsForBlocks(
  blocks: Entity[],
  fetchBatch: (ids: string[], spaceId?: string) => Promise<Entity[]>,
  spaceId?: string
): Promise<Record<string, Entity[]>> {
  const idsByBlock = getCollectionItemIds(blocks);
  const allIds = [...new Set(Object.values(idsByBlock).flat())];

  if (allIds.length === 0) return {};

  const fetched = await fetchBatch(allIds, spaceId);
  const entityMap = new Map(fetched.map(e => [e.id, e]));

  const result: Record<string, Entity[]> = {};
  for (const [blockId, entityIds] of Object.entries(idsByBlock)) {
    result[blockId] = entityIds.map(id => entityMap.get(id)).filter((e): e is Entity => e != null);
  }

  return result;
}
