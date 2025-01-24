'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';

import { useEntity } from '~/core/database/entities';
import { EntityId } from '~/core/io/schema';

export type Relationship = {
  from: { name: string; id: string };
  to: { name: string; id: string };
  relationType: { name: string; id: string };
} | null;

export const useRelationship = (entityId: string, spaceId: string) => {
  const entity = useEntity({ id: EntityId(entityId), spaceId });

  const isRelation = entity?.triples.some(triple => triple.attributeId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE) ?? false;

  const fromTriple = entity?.triples.find(triple => triple.attributeId === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
  const fromEntity = useEntity({ id: EntityId(fromTriple?.value.value.split('graph://')[1] ?? '') });

  const toTriple = entity?.triples.find(triple => triple.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);
  const toEntity = useEntity({ id: EntityId(toTriple?.value.value.split('graph://')[1] ?? '') });

  const relationTypeTriple = entity?.triples.find(triple => triple.attributeId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);
  const relationTypeEntity = useEntity({
    id: EntityId(relationTypeTriple?.value.value.split('graph://')[1] ?? ''),
  });

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
