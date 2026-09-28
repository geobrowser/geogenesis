import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { Relation } from '~/core/types';

import { DATA_BLOCK_DROPDOWNS_PROPERTY_ID } from './block-ontology-ids';

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

/** Every relation type that carries block view config on the BLOCKS-relation entity. */
export const BLOCK_CONFIG_RELATION_TYPE_IDS: readonly string[] = [
  SystemIds.PROPERTIES,
  SystemIds.SHOWN_COLUMNS,
  SystemIds.VIEW_PROPERTY,
  DATA_BLOCK_DROPDOWNS_PROPERTY_ID,
];

export function isBlockConfigRelationType(typeId: string): boolean {
  return BLOCK_CONFIG_RELATION_TYPE_IDS.includes(typeId);
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

export function relationsMatchingColumnProperty(relations: Relation[], propertyId: string): Relation[] {
  return relations.filter(
    r => isShownColumnRelationType(r.type.id) && ID.equals(columnPropertyIdFromRelation(r), propertyId)
  );
}
