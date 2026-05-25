import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { Relation } from '~/core/types';

/** Property id used for column visibility (prefers `toEntity.value` when set). */
export function columnPropertyIdFromRelation(relation: Relation): string {
  const value = relation.toEntity.value;
  if (value && String(value).length > 0) return String(value);
  return relation.toEntity.id;
}

export function isShownColumnRelationType(typeId: string): boolean {
  return typeId === SystemIds.SHOWN_COLUMNS || typeId === SystemIds.PROPERTIES;
}

export function isShownColumnRelation(relation: Relation): boolean {
  return !relation.isDeleted && isShownColumnRelationType(relation.type.id);
}

export function isBlockConfigRelationType(typeId: string): boolean {
  return (
    typeId === SystemIds.PROPERTIES ||
    typeId === SystemIds.SHOWN_COLUMNS ||
    typeId === SystemIds.VIEW_PROPERTY
  );
}

/** Keep one relation per target property / view. */
export function dedupeRelationsByColumnProperty(relations: Relation[]): Relation[] {
  const seen = new Set<string>();
  const out: Relation[] = [];
  for (const relation of relations) {
    const key = columnPropertyIdFromRelation(relation);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(relation);
  }
  return out;
}

export function relationsMatchingColumnProperty(
  relations: Relation[],
  propertyId: string
): Relation[] {
  return relations.filter(
    r =>
      isShownColumnRelationType(r.type.id) &&
      ID.equals(columnPropertyIdFromRelation(r), propertyId)
  );
}
