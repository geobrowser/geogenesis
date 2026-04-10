import { Relation } from '~/core/types';

export function dedupeRelationsByToEntityId<T extends Pick<Relation, 'toEntity'>>(relations: T[]): T[] {
  const seen = new Set<string>();

  return relations.filter(relation => {
    if (seen.has(relation.toEntity.id)) {
      return false;
    }

    seen.add(relation.toEntity.id);
    return true;
  });
}
