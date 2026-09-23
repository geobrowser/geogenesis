import { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

export function dedupeRelationsByToEntityId<T extends Pick<Relation, 'toEntity'>>(relations: T[]): T[] {
  const seen = new Set<string>();

  return relations.filter(relation => {
    const key = normId(relation.toEntity.id);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
