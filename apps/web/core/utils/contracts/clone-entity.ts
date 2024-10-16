import { Op, SYSTEM_IDS, createRelationship } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { Relation } from '~/core/io/dto/entities';
import { Triple as TripleType } from '~/core/types';
import { Ops } from '~/core/utils/ops';

type Options = {
  oldEntityId: string;
  entityId?: string;
  entityName?: string;
};
1;
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

  const triplesToClone: Array<TripleType> = oldEntity.triples.filter(
    (triple: TripleType) => !SKIPPED_ATTRIBUTES.includes(triple.attributeId)
  );

  const relationsToClone: Array<Relation> = oldEntity.relationsOut.filter(
    (relation: Relation) => !SKIPPED_ATTRIBUTES.includes(relation.typeOf.id)
  );

  const blocksToClone: Array<Relation> = oldEntity.relationsOut.filter(
    (relation: Relation) => relation.typeOf.id === SYSTEM_IDS.BLOCKS
  );

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
      ...createRelationship({
        fromId: newEntityId,
        toId: relation.toEntity.id,
        relationTypeId: relation.typeOf.id,
      })
    );
  });

  const blockOps = await cloneBlocks(blocksToClone, newEntityId);

  newOps.push(...blockOps);

  return newOps;
};

const cloneBlocks = async (blocksToClone: Array<Relation>, newEntityId: string) => {
  const allOps = await Promise.all(
    blocksToClone.map(async block => {
      const newBlockId = ID.createEntityId();

      const relationshipOps = createRelationship({
        fromId: newEntityId,
        toId: newBlockId,
        relationTypeId: block.typeOf.id,
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
