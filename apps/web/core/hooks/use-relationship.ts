'use client';

import { GraphUrl, SystemIds } from '@graphprotocol/grc-20';

import { useEntity } from '~/core/database/entities';
import { EntityId } from '~/core/io/schema';

export type Relationship = {
  from: { name: string; id: string };
  to: { name: string; id: string };
  relationType: { name: string; id: string };
} | null;

export const useRelationship = (entityId: string, spaceId: string) => {
  const entity = useEntity({ id: EntityId(entityId), spaceId });

  const isRelation = entity?.triples.some(triple => triple.attributeId === SystemIds.RELATION_TYPE_ATTRIBUTE) ?? false;

  const from =
    entity?.triples.find(triple => triple.attributeId === SystemIds.RELATION_FROM_ATTRIBUTE)?.value.value ?? '';
  const fromEntityId = GraphUrl.isValid(from) ? GraphUrl.toEntityId(from) : '';
  const fromEntity = useEntity({ id: EntityId(fromEntityId) });

  const to = entity?.triples.find(triple => triple.attributeId === SystemIds.RELATION_TO_ATTRIBUTE)?.value.value ?? '';
  const toEntityId = GraphUrl.isValid(to) ? GraphUrl.toEntityId(to) : '';
  const toEntity = useEntity({ id: EntityId(toEntityId) });

  const relationType =
    entity?.triples.find(triple => triple.attributeId === SystemIds.RELATION_TYPE_ATTRIBUTE)?.value.value ?? '';
  const relationTypeEntityId = GraphUrl.isValid(relationType) ? GraphUrl.toEntityId(relationType) : '';
  const relationTypeEntity = useEntity({ id: EntityId(relationTypeEntityId) });

  let relationship: Relationship = null;

  if (isRelation && fromEntity && toEntity && relationTypeEntity) {
    relationship = {
      from: { name: fromEntity.name ?? '', id: fromEntity.id },
      to: { name: toEntity.name ?? '', id: toEntity.id },
      relationType: { name: relationTypeEntity.name ?? '', id: relationTypeEntity.id },
    };
  }

  const isRelationship = !!relationship;

  return isRelationship ? ([true, relationship] as const) : ([false, null] as const);
};
