import { Op, Relation, SYSTEM_IDS } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { Relation as RelationType } from '~/core/types';
import { Ops } from '~/core/utils/ops';

type Options = {
  oldEntityId: string;
  entityId?: string;
  entityName?: string;
};

export const cloneEntity = async (options: Options): Promise<Array<Op>> => {
  if (!options.oldEntityId) {
    throw new Error(`Must specify entity to clone.`);
  }

  const { oldEntityId, entityId = null, entityName = null } = options;

  const oldEntity = await Subgraph.fetchEntity({ id: oldEntityId });

  if (!oldEntity) return [];

  const newEntityId = entityId ?? ID.createEntityId();
  const newEntityName = entityName ?? oldEntity.name ?? '';
  const newOps: Array<Op> = [];

  const triplesToClone = oldEntity.triples.filter(triple => !SKIPPED_ATTRIBUTES.includes(triple.attributeId));

  const relationsToClone = oldEntity.relationsOut.filter(relation => !SKIPPED_ATTRIBUTES.includes(relation.typeOf.id));

  const blocksToClone = oldEntity.relationsOut.filter(relation => relation.typeOf.id === SYSTEM_IDS.BLOCKS);

  newOps.push(
    Ops.create({
      entity: newEntityId,
      attribute: SYSTEM_IDS.NAME,
      value: {
        type: 'TEXT',
        value: newEntityName,
      },
    })
  );

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
      ...Relation.make({
        fromId: newEntityId,
        toId: relation.toEntity.id,
        relationTypeId: relation.typeOf.id,
        position: relation.index,
      })
    );
  });

  const blockOps = await cloneBlocks(blocksToClone, newEntityId);

  newOps.push(...blockOps);

  return newOps;
};

const cloneBlocks = async (blocksToClone: Array<RelationType>, newEntityId: string) => {
  const allOps = await Promise.all(
    blocksToClone.map(async block => {
      const newBlockId = ID.createEntityId();

      const relationshipOps = Relation.make({
        fromId: newEntityId,
        toId: newBlockId,
        relationTypeId: block.typeOf.id,
        position: block.index,
      });

      const newBlockOps = await cloneEntity({
        oldEntityId: block.toEntity.id,
        entityId: newBlockId,
        entityName: block.toEntity.name ?? '',
      });

      return [...relationshipOps, ...newBlockOps];
    })
  );

  return allOps.flat();
};

const SKIPPED_ATTRIBUTES = [SYSTEM_IDS.NAME, SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.BLOCKS];
