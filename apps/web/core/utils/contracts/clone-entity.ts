import { CONTENT_IDS, Op, Relation, SYSTEM_IDS } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { Relation as RelationType } from '~/core/types';
import { Ops } from '~/core/utils/ops';

type Options = {
  oldEntityId: string;
  entityId?: string;
  entityName?: string | null;
};

export const cloneEntity = async (options: Options): Promise<Array<Op>> => {
  if (!options.oldEntityId) {
    throw new Error(`Must specify entity to clone.`);
  }

  const { oldEntityId, entityId = null, entityName } = options;

  const oldEntity = await Subgraph.fetchEntity({ id: oldEntityId });

  if (!oldEntity) return [];

  const newEntityId = entityId ?? ID.createEntityId();
  const newEntityName = entityName;
  const newOps: Array<Op> = [];

  const triplesToClone = oldEntity.triples.filter(triple => !SKIPPED_ATTRIBUTES.includes(triple.attributeId));
  const relationsToClone = oldEntity.relationsOut.filter(relation => !SKIPPED_ATTRIBUTES.includes(relation.typeOf.id));
  const tabsToClone = oldEntity.relationsOut.filter(relation => relation.typeOf.id === SYSTEM_IDS.TABS_ATTRIBUTE);
  const blocksToClone = oldEntity.relationsOut.filter(relation => relation.typeOf.id === SYSTEM_IDS.BLOCKS);

  if (newEntityName) {
    newOps.push(
      Ops.create({
        entity: newEntityId,
        attribute: SYSTEM_IDS.NAME_ATTRIBUTE,
        value: {
          type: 'TEXT',
          value: newEntityName,
        },
      })
    );
  }

  triplesToClone.forEach(triple => {
    newOps.push(
      Ops.create({
        entity: newEntityId,
        attribute: triple.attributeId,
        value: {
          type: triple.value.type,
          value: triple.value.value,
        },
      })
    );
  });

  relationsToClone.forEach(relation => {
    newOps.push(
      Relation.make({
        fromId: newEntityId,
        toId: relation.toEntity.id,
        relationTypeId: relation.typeOf.id,
        position: relation.index,
      })
    );
  });

  const tabOps = await cloneRelatedEntities(tabsToClone, newEntityId);
  newOps.push(...tabOps);

  const blockOps = await cloneRelatedEntities(blocksToClone, newEntityId);
  newOps.push(...blockOps);

  return newOps;
};

const cloneRelatedEntities = async (relatedEntitiesToClone: Array<RelationType>, newEntityId: string) => {
  const allOps = await Promise.all(
    relatedEntitiesToClone.map(async relation => {
      const newRelatedEntityId = ID.createEntityId();

      const relationshipOp = Relation.make({
        fromId: newEntityId,
        toId: newRelatedEntityId,
        relationTypeId: relation.typeOf.id,
        position: relation.index,
      });

      const newRelatedEntityOps = await cloneEntity({
        oldEntityId: relation.toEntity.id,
        entityId: newRelatedEntityId,
        entityName: relation.toEntity.name ?? '',
      });

      return [relationshipOp, ...newRelatedEntityOps];
    })
  );

  return allOps.flat();
};

const SKIPPED_ATTRIBUTES = [
  SYSTEM_IDS.NAME_ATTRIBUTE,
  SYSTEM_IDS.DESCRIPTION_ATTRIBUTE,
  CONTENT_IDS.AVATAR_ATTRIBUTE,
  SYSTEM_IDS.TABS_ATTRIBUTE,
  SYSTEM_IDS.BLOCKS,
];
