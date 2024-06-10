import { Op, SYSTEM_IDS } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { Entity as EntityType, Triple as TripleType, Value as ValueType } from '~/core/types';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';

type Options = {
  oldEntityId: string;
  entityId?: string;
  entityName?: string;
  spaceId: string;
};

export const cloneEntity = async (options: Options) => {
  if (!options.oldEntityId || !options.spaceId) {
    throw new Error(`must specify all required options: oldEntityId and spaceId`);
  }

  const { oldEntityId, entityId = null, entityName = null, spaceId } = options;

  const oldEntity = await Subgraph.fetchEntity({ id: oldEntityId });

  if (!oldEntity) return [];

  const newEntityId = entityId ?? ID.createEntityId();
  const newEntityName = entityName ?? oldEntity.name ?? '';
  const newTriples: Array<TripleType> = [];

  const triplesToClone: Array<TripleType> = oldEntity.triples.filter(
    (triple: TripleType) => !SKIPPED_ATTRIBUTES.includes(triple.attributeId)
  );

  newTriples.push(
    Triple.withId({
      entityId: newEntityId,
      entityName: newEntityName,
      attributeId: SYSTEM_IDS.NAME,
      attributeName: 'Name',
      space: spaceId,
      value: {
        type: 'TEXT',
        value: newEntityName,
      },
    })
  );

  triplesToClone.forEach(triple => {
    if (triple.value.type === 'ENTITY') {
      newTriples.push(
        Triple.withId({
          ...triple,
          space: spaceId,
          entityName: newEntityName,
          entityId: newEntityId,
        })
      );
    } else {
      newTriples.push(
        Triple.withId({
          ...triple,
          space: spaceId,
          entityName: newEntityName,
          entityId: newEntityId,
          value: triple.value,
        })
      );
    }
  });

  // @TODO(migration)
  // migrate to collection
  const blockIdsTriple =
    oldEntity.triples.find((triple: TripleType) => triple.attributeId === SYSTEM_IDS.BLOCKS) ?? null;

  if (blockIdsTriple) {
    const blockIds = blockIdsTriple ? (JSON.parse(Value.stringValue(blockIdsTriple) || '[]') as string[]) : [];

    const newBlockIds = blockIds.map(() => {
      const newBlockId = ID.createEntityId();
      return newBlockId;
    });

    const newBlockIdsTriple = Triple.withId({
      attributeId: SYSTEM_IDS.BLOCKS,
      attributeName: 'Blocks',
      space: spaceId,
      entityId: newEntityId,
      entityName: newEntityName,
      value: {
        type: 'TEXT',
        value: JSON.stringify(newBlockIds),
      },
    });

    const blockEntities = await Promise.all(
      blockIds.map((blockId: string) => {
        return Subgraph.fetchEntity({ id: blockId });
      })
    );

    const newBlockTriples: Array<TripleType> = [];

    blockEntities.forEach((blockEntity: EntityType | null, index: number) => {
      if (!blockEntity) return;

      blockEntity.triples.forEach((triple: TripleType) => {
        if (triple.attributeId === SYSTEM_IDS.PARENT_ENTITY) {
          newBlockTriples.push(
            Triple.withId({
              ...triple,
              space: spaceId,
              entityId: newBlockIds[index],
              value: {
                type: 'ENTITY',
                name: newEntityName,
                value: newEntityId,
              },
            })
          );
        } else if (triple.attributeId === SYSTEM_IDS.FILTER && triple.value.type === 'TEXT') {
          let newValue = triple.value.value;

          const spaceRegex = /entityOf_\s*:\s*{\s*space\s*:\s*"([^"]*)"\s*}/;
          const spaceMatch = triple.value.value.match(spaceRegex);
          const spaceValue = spaceMatch ? spaceMatch[1] : null;

          if (spaceValue) {
            newValue = triple.value.value.replaceAll(spaceValue, spaceId);
          }

          newBlockTriples.push(
            Triple.withId({
              ...triple,
              space: spaceId,
              entityId: newBlockIds[index],
              value: {
                type: 'TEXT',
                value: newValue,
              },
            })
          );
        } else if (triple.value.type === 'ENTITY') {
          newBlockTriples.push(
            Triple.withId({
              ...triple,
              space: spaceId,
              entityId: newBlockIds[index],
            })
          );
        } else {
          newBlockTriples.push(
            Triple.withId({
              ...triple,
              space: spaceId,
              entityId: newBlockIds[index],
              value: triple.value,
            })
          );
        }
      });
    });

    newTriples.push(...newBlockTriples);
    newTriples.push(newBlockIdsTriple);
  }

  return newTriples;
};

const SKIPPED_ATTRIBUTES = [SYSTEM_IDS.NAME, SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.BLOCKS];
