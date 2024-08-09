import { SYSTEM_IDS } from '@geogenesis/sdk';

import { ID } from '~/core/id';
import { Subgraph } from '~/core/io';
import { Triple as TripleType } from '~/core/types';
import { Triples } from '~/core/utils/triples';

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
    Triples.withId({
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
        Triples.withId({
          ...triple,
          space: spaceId,
          entityName: newEntityName,
          entityId: newEntityId,
        })
      );
    } else {
      newTriples.push(
        Triples.withId({
          ...triple,
          space: spaceId,
          entityName: newEntityName,
          entityId: newEntityId,
          value: triple.value,
        })
      );
    }
  });

  // @TODO(relations)
  // Clon relations and blocks
  // const { blockCollectionItems, blockIdsTriple } = getCollectionItemsFromBlocksTriple(oldEntity);

  // if (blockIdsTriple) {
  //   const blockIds = blockCollectionItems.map(b => b.entity.id);

  //   const newBlockIds = blockIds.map(() => {
  //     const newBlockId = ID.createEntityId();
  //     return newBlockId;
  //   });

  //   // 1. Create collection
  //   const collectionOp = createCollection();

  //   // Create the collection entity by adding the collection type
  //   newTriples.push({
  //     space: spaceId,
  //     attributeId: collectionOp.triple.attribute,
  //     entityId: collectionOp.triple.entity,
  //     entityName: null,
  //     attributeName: 'Types',
  //     value: {
  //       // @TODO(migration): This might be a collection in the future which
  //       // would create a recursive collection creation loop
  //       type: 'ENTITY',
  //       value: collectionOp.triple.value.value,
  //       name: 'Collection',
  //     },
  //   });

  //   // 2. Create collection item for each block
  //   const collectionItemsTriples = newBlockIds
  //     .map(id =>
  //       Collections.createCollectionItemTriples({
  //         collectionId: collectionOp.triple.entity,
  //         entityId: id,
  //         spaceId,
  //       })
  //     )
  //     .flat();

  //   newTriples.push(...collectionItemsTriples);

  //   const newBlockIdsTriple = Triples.withId({
  //     attributeId: SYSTEM_IDS.BLOCKS,
  //     attributeName: 'Blocks',
  //     space: spaceId,
  //     entityId: newEntityId,
  //     entityName: newEntityName,
  //     value: {
  //       type: 'COLLECTION',
  //       value: collectionOp.triple.entity,
  //       items: Collections.itemFromTriples(groupBy(collectionItemsTriples, c => c.entityId)),
  //     },
  //   });

  //   newTriples.push(newBlockIdsTriple);

  //   const blockEntities = await Promise.all(
  //     blockIds.map((blockId: string) => {
  //       return Subgraph.fetchEntity({ id: blockId });
  //     })
  //   );

  //   const newBlockTriples: Array<TripleType> = [];

  //   blockEntities.forEach((blockEntity: EntityType | null, index: number) => {
  //     if (!blockEntity) return;

  //     blockEntity.triples.forEach((triple: TripleType) => {
  //       if (triple.attributeId === SYSTEM_IDS.PARENT_ENTITY) {
  //         newBlockTriples.push(
  //           Triples.withId({
  //             ...triple,
  //             space: spaceId,
  //             entityId: newBlockIds[index],
  //             value: {
  //               type: 'ENTITY',
  //               name: newEntityName,
  //               value: newEntityId,
  //             },
  //           })
  //         );
  //       } else if (triple.attributeId === SYSTEM_IDS.FILTER && triple.value.type === 'TEXT') {
  //         let newValue = triple.value.value;

  //         const spaceRegex = /entityOf_\s*:\s*{\s*space\s*:\s*"([^"]*)"\s*}/;
  //         const spaceMatch = triple.value.value.match(spaceRegex);
  //         const spaceValue = spaceMatch ? spaceMatch[1] : null;

  //         if (spaceValue) {
  //           newValue = triple.value.value.replaceAll(spaceValue, spaceId);
  //         }

  //         newBlockTriples.push(
  //           Triples.withId({
  //             ...triple,
  //             space: spaceId,
  //             entityId: newBlockIds[index],
  //             value: {
  //               type: 'TEXT',
  //               value: newValue,
  //             },
  //           })
  //         );
  //       } else if (triple.value.type === 'ENTITY') {
  //         newBlockTriples.push(
  //           Triples.withId({
  //             ...triple,
  //             space: spaceId,
  //             entityId: newBlockIds[index],
  //           })
  //         );
  //       } else {
  //         newBlockTriples.push(
  //           Triples.withId({
  //             ...triple,
  //             space: spaceId,
  //             entityId: newBlockIds[index],
  //             value: triple.value,
  //           })
  //         );
  //       }
  //     });
  //   });

  // newTriples.push(...newBlockTriples);
  // }

  return newTriples;
};

const SKIPPED_ATTRIBUTES = [SYSTEM_IDS.NAME, SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.BLOCKS];
