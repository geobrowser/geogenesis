import { SYSTEM_IDS } from '@geogenesis/sdk';
import { groupBy } from 'effect/Array';
import { atom, useAtomValue } from 'jotai';

import { Relation } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { createRelationsAtom } from '../state/actions-store/create-relations-for-entity-atom';
import { ValueType } from '../types';
import { Triples } from '../utils/triples';
import { localOpsAtom } from './write';

// @TODO: Should our normalized typs be a schema instead of TS type?
type NormalizedTriple = {
  entityId: EntityId;
  attributeId: EntityId;
  value: {
    type: ValueType;
    // a string for the value or an id pointing to the entity representing the value (e.g., an image)
    value: string;
  };
  timestamp: string;
  isDeleted: boolean;
  hasBeenPublished: boolean;
};

type NormalizedEntity = {
  id: EntityId;
  name: string | null;
  typesIds: EntityId[];
  relationsOutIds: EntityId[];
  triples: NormalizedTriple[];
};

type MappedNormalizedEntities = Record<EntityId, NormalizedEntity>;

const entitiesAtom = atom<MappedNormalizedEntities>(get => {
  const localOps = get(localOpsAtom);
  const localRelations = get(createRelationsAtom([]));

  const entities: MappedNormalizedEntities = {};

  const localOpsByEntityId = groupBy(localOps, op => op.entityId);
  const localRelationsByFromId = groupBy(localRelations, r => r.fromEntity.id);

  for (const [entityId, ops] of Object.entries(localOpsByEntityId)) {
    const id = EntityId(entityId);
    const relationsOut: Relation[] = localRelationsByFromId[id] ?? [];
    const triples: NormalizedTriple[] = ops.map(op => ({
      entityId: EntityId(op.entityId),
      attributeId: EntityId(op.attributeId),
      value: {
        type: op.value.type,
        value: op.value.value,
      },
      timestamp: op.timestamp ?? Triples.timestamp(),
      isDeleted: op.isDeleted ?? false,
      hasBeenPublished: op.hasBeenPublished ?? false,
    }));

    // We can optimize performance by making mappings of these array operations outside of the loop
    // but the number of relations and triples for a given entity is small so it's not a big deal atm.
    const name = triples.find(t => t.attributeId === SYSTEM_IDS.NAME)?.value.value;
    const typesViaRelations: EntityId[] = relationsOut.filter(t => t.typeOf.id === SYSTEM_IDS.TYPES).map(t => t.id);
    const typesViaTriples: EntityId[] = triples
      .filter(t => t.attributeId === SYSTEM_IDS.TYPES)
      .map(t => EntityId(t.value.value));

    const relationsOutIds = relationsOut.map(r => r.id);

    const normalizedEntity: NormalizedEntity = {
      id,
      name: name ?? null,
      typesIds: [...new Set([...typesViaRelations, ...typesViaTriples]).values()],
      relationsOutIds,
      triples: triples,
    };

    entities[id] = normalizedEntity;
  }

  console.log('entities', entities);

  return entities;
});

export function useEntities() {
  const entities = useAtomValue(entitiesAtom);
  return { entities: Object.values(entities) };
}
