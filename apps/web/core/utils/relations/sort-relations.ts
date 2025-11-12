import { RelationRenderableProperty } from '~/core/types';

export type RelationWithIndex = RelationRenderableProperty & { index: string };

/**
 * Sorts relations by their index property using stable sorting
 * @param items - Relations to sort
 * @returns Sorted relations
 */
export function sortRelationsByIndex<T extends { index?: string; relationId: string }>(items: T[]): T[] {
  if (!items.length) {
    return items;
  }

  const sortableItems = [...items];
  const hasAnyIndices = sortableItems.some(item => !!item.index);

  if (!hasAnyIndices) {
    return sortableItems;
  }

  const itemsWithPosition = sortableItems.map((item, originalIndex) => ({
    item,
    originalIndex
  }));

  const sortedItems = itemsWithPosition
    .sort((a, b) => {
      const itemA = a.item;
      const itemB = b.item;

      const indexA = itemA.index || '';
      const indexB = itemB.index || '';

      if (indexA && indexB) {
        const compareResult = indexA.localeCompare(indexB, undefined, { numeric: true });
        return compareResult !== 0 ? compareResult : a.originalIndex - b.originalIndex;
      }

      if (indexA && !indexB) return -1;
      if (!indexA && indexB) return 1;

      const idA = itemA.relationId || '';
      const idB = itemB.relationId || '';

      if (idA && idB) {
        const compareResult = idA.localeCompare(idB);
        return compareResult !== 0 ? compareResult : a.originalIndex - b.originalIndex;
      }

      return a.originalIndex - b.originalIndex;
    })
    .map(wrapper => wrapper.item);

  return sortedItems;
}

/**
 * Adds index information to relations using the provided index map
 * @param relations - Relations to add indices to
 * @param relationIndexMap - Map of relation ID to index
 * @returns Relations with index information
 */
export function addRelationIndices(
  relations: RelationRenderableProperty[],
  relationIndexMap: Map<string, string>
): RelationWithIndex[] {
  return relations
    .filter(r => !r.placeholder)
    .map(r => ({
      ...r,
      index: relationIndexMap.get(r.relationId) || '',
    }));
}

/**
 * Complete utility to sort relations using their stored indices
 * @param relations - Relations to sort
 * @param relationIndexMap - Map of relation ID to index
 * @returns Sorted relations with index information
 */
export function sortRelationsWithIndices(
  relations: RelationRenderableProperty[],
  relationIndexMap: Map<string, string>
): RelationWithIndex[] {
  const relationsWithIndex = addRelationIndices(relations, relationIndexMap);
  return sortRelationsByIndex(relationsWithIndex);
}