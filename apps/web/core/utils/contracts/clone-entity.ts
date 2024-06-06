import { SYSTEM_IDS } from '@geogenesis/ids';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { CreateTripleAction, Entity as EntityType, Triple as TripleType, Value as ValueType } from '~/core/types';
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

  console.info(options.entityName ? `cloning ${entityName}...` : `cloning entity...`);

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
        type: 'string',
        value: newEntityName,
        id: ID.createValueId(),
      },
    })
  );

  triplesToClone.forEach(triple => {
    if (triple.value.type === 'entity') {
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
          value: {
            ...triple.value,
            id: ID.createValueId(),
          },
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
        id: ID.createValueId(),
        type: 'string',
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
                ...triple.value,
                type: 'entity',
                name: newEntityName,
                id: newEntityId,
              } as ValueType,
            })
          );
        } else if (triple.attributeId === SYSTEM_IDS.FILTER && triple.value.type === 'string') {
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
                type: 'string',
                value: newValue,
                id: ID.createValueId(),
              },
            })
          );
        } else if (triple.value.type === 'entity') {
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
              value: {
                ...triple.value,
                id: ID.createValueId(),
              },
            })
          );
        }
      });
    });

    newTriples.push(...newBlockTriples);
    newTriples.push(newBlockIdsTriple);
  }

  // @TODO(migration)
  // migrate all actions to ops in new data model
  const actions: Array<CreateTripleAction> = [];

  newTriples.forEach(triple => {
    actions.push({ type: 'createTriple', ...triple });
  });

  return actions;
};

const SKIPPED_ATTRIBUTES = [SYSTEM_IDS.NAME, SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.BLOCKS];
