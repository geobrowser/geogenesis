import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import type { Relation } from '~/core/types';
import { dedupeRelationsByToEntityId } from '~/core/utils/dedupe-relations';

export type ClaimSource = {
  id: string;
  name: string | null;
};

/**
 * Live, distinct source targets in relation order.
 *
 * Availability, provenance, and the Sources feed all depend on this exact set. Keeping the
 * extraction here prevents one surface from counting a deleted or duplicate source that another
 * surface does not render.
 */
export function getClaimSources(relations: Relation[]): ClaimSource[] {
  return dedupeRelationsByToEntityId(
    relations.filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, SOURCES_PROPERTY_ID))
  ).map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name }));
}
