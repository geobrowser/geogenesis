'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import {
  createCollection,
  createCollectionItem,
  createGeoId,
  createTripleId,
  reorderCollectionItem,
} from '@geogenesis/sdk';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useLocalStore } from '~/core/state/local-store';
import { EntityValue, StringValue, Triple } from '~/core/types';

export default function CollectionsPage() {
  const { createMany, update } = useActionsStore();
  const { triples } = useLocalStore();

  const handleCreateCollectionEntity = () => {
    const collectionId = createCollection();

    // @TODO: This should be more ergonomic with some new local DB mechanism that
    // only receives the baseline Geo triple properties.
    createMany([
      {
        id: createTripleId({
          attributeId: SYSTEM_IDS.TYPES,
          entityId: '6c9a06d9-de52-42ce-9fa2-d2f070ae7719',
          spaceId: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
        }),
        entityId: '6c9a06d9-de52-42ce-9fa2-d2f070ae7719',
        entityName: '6c9a06d9-de52-42ce-9fa2-d2f070ae7719',
        attributeId: SYSTEM_IDS.TYPES,
        attributeName: 'Types',
        space: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
        value: {
          type: 'entity',
          id: SYSTEM_IDS.COLLECTION_TYPE,
        } as EntityValue,
      },
    ]);
  };

  const handleCreateCollectionItem = () => {
    const [typeTriple, collectionIdTriple, entityIdTriple, orderTriple] = createCollectionItem({
      collectionId: '6c9a06d9-de52-42ce-9fa2-d2f070ae7719',
      entityId: createGeoId(),
      spaceId: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    });

    // createMany([
    //   {
    //     ...typeTriple,
    //     id: createTripleId({
    //       spaceId: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //       entityId: typeTriple.entityId,
    //       attributeId: typeTriple.attributeId,
    //     }),
    //     space: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //     attributeName: 'Types',
    //     entityName: 'Collection Entity A',
    //     value: {
    //       ...typeTriple.value,
    //       name: '',
    //     },
    //   },
    //   {
    //     ...collectionIdTriple,
    //     id: createTripleId({
    //       spaceId: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //       entityId: collectionIdTriple.entityId,
    //       attributeId: collectionIdTriple.attributeId,
    //     }),
    //     space: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //     attributeName: 'Collection ID',
    //     entityName: 'Collection Entity A',
    //     value: {
    //       ...collectionIdTriple.value,
    //       name: '',
    //     },
    //   },
    //   {
    //     ...entityIdTriple,
    //     id: createTripleId({
    //       spaceId: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //       entityId: entityIdTriple.entityId,
    //       attributeId: entityIdTriple.attributeId,
    //     }),
    //     space: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //     attributeName: 'Entity ID',
    //     entityName: 'Collection Entity A',
    //     value: {
    //       ...entityIdTriple.value,
    //       name: createGeoId(),
    //     },
    //   },
    //   {
    //     ...orderTriple,
    //     id: createTripleId({
    //       spaceId: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //       entityId: orderTriple.entityId,
    //       attributeId: orderTriple.attributeId,
    //     }),
    //     space: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
    //     attributeName: 'Index',
    //     entityName: 'Collection Entity A',
    //     value: {
    //       ...orderTriple.value,
    //     },
    //   },
    // ]);
  };

  // Group collection item triples by entity id
  const collectionItems = triples.reduce((acc, t) => {
    const hasEntityId = acc.get(t.entityId);

    if (hasEntityId) {
      acc.set(t.entityId, [...hasEntityId, t]);
    } else {
      acc.set(t.entityId, [t]);
    }

    return acc;
  }, new Map<string, Triple[]>());

  const orderedCollectionItems = Array.from(collectionItems.values())
    .map(c => {
      return {
        collectionItemId: c.find(t => t)?.entityId as string | undefined,
        collectionId: (
          c.find(c => c.attributeId === SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE)?.value as
            | EntityValue
            | undefined
        )?.id,
        entityId: (
          c.find(c => c.attributeId === SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE)?.value as EntityValue | undefined
        )?.id,
        order: (c.find(c => c.attributeId === SYSTEM_IDS.COLLECTION_ITEM_INDEX)?.value as StringValue | undefined)
          ?.value,
      };
    })
    .sort((a, z) => {
      if (a.order && z.order) {
        return a.order > z.order ? 1 : -1;
      }

      return 0;
    });

  const handleCollectionItemOrder = (collectionItemId: string, position: number, direction: 'up' | 'down') => {
    let beforeItemIndex: number | undefined;
    let afterItemIndex: number | undefined;

    if (direction === 'up') {
      if (position === 0) {
        return;
      }

      beforeItemIndex = position - 2;
      afterItemIndex = position - 1;
    }

    if (direction === 'down') {
      if (position === orderedCollectionItems.length - 1) {
        return;
      }

      beforeItemIndex = position + 1;
      afterItemIndex = position + 2;
    }

    const beforeItemOrderValue = beforeItemIndex ? orderedCollectionItems[beforeItemIndex]?.order : undefined;
    const afterItemOrderValue = afterItemIndex ? orderedCollectionItems[afterItemIndex]?.order : undefined;

    const newTripleOrdering = reorderCollectionItem({
      collectionItemId,
      afterIndex: afterItemOrderValue,
      beforeIndex: beforeItemOrderValue,
    });

    const orderTripleForCollectionItem = collectionItems
      .get(collectionItemId)
      ?.find(t => t.attributeId === SYSTEM_IDS.COLLECTION_ITEM_INDEX);

    // @TODO: Upsert
    update(
      {
        ...newTripleOrdering,
        id: orderTripleForCollectionItem!.id, // need to keep old id when updating
        space: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
        attributeName: 'Index',
        entityName: 'Collection Entity A',
      },
      orderTripleForCollectionItem! // We know this exists or it wouldn't be rendered
    );
  };

  return (
    <div>
      <div className="flex items-center gap-8">
        <button onClick={handleCreateCollectionEntity}>Create collection</button>
        <button onClick={handleCreateCollectionItem}>Create collection item</button>
      </div>

      <div className="flex flex-col">
        {orderedCollectionItems.map((c, i) => {
          const collectionItemId = c.collectionItemId;
          const indexTripleValue = c.order;
          const entityReferenceTripleValue = c.entityId;

          if (!indexTripleValue || !entityReferenceTripleValue) {
            return null;
          }

          return (
            <div key={collectionItemId} className="flex items-center gap-2">
              {indexTripleValue} – {entityReferenceTripleValue}
              <button
                onClick={() => (collectionItemId ? handleCollectionItemOrder(collectionItemId, i, 'up') : undefined)}
              >
                Up
              </button>
              <button
                onClick={() => (collectionItemId ? handleCollectionItemOrder(collectionItemId, i, 'down') : undefined)}
              >
                Down
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
