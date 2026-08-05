import type { Relation, Value } from '~/core/types';

/**
 * Local values/relations that belong to a draft entity and its nested blocks (for publish or cancel).
 */
export function filterLocalChangesToEntitySubgraph(
  rootEntityId: string,
  values: Value[],
  relations: Relation[]
): { values: Value[]; relations: Relation[] } {
  const relatedEntityIds = new Set<string>([rootEntityId]);
  let expanded = true;

  while (expanded) {
    expanded = false;
    for (const relation of relations) {
      const touches = relatedEntityIds.has(relation.fromEntity.id) || relatedEntityIds.has(relation.toEntity.id);
      if (!touches) continue;

      if (!relatedEntityIds.has(relation.fromEntity.id)) {
        relatedEntityIds.add(relation.fromEntity.id);
        expanded = true;
      }
      if (!relatedEntityIds.has(relation.toEntity.id)) {
        relatedEntityIds.add(relation.toEntity.id);
        expanded = true;
      }
    }
  }

  return {
    values: values.filter(v => relatedEntityIds.has(v.entity.id)),
    relations: relations.filter(r => relatedEntityIds.has(r.fromEntity.id) || relatedEntityIds.has(r.toEntity.id)),
  };
}
