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

  const handleCreateCollectionTriple = () => {
    const collectionId = createCollection();

    // @TODO: This should be more ergonomic with some new local DB mechanism that
    // only receives the baseline Geo triple properties.
    createMany([
      {
        id: 'test-collection-triple-id',
        entityId: 'test-entity-id',
        entityName: 'Test Collection',
        attributeId: 'test-attribute-id',
        attributeName: 'Test attribute',
        space: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
        value: {
          type: 'collection',
          id: collectionId,
        },
      },
    ]);
  };

  const handleCreateCollectionItem = () => {
    const [typeTriple, collectionIdTriple, entityIdTriple, orderTriple] = createCollectionItem({
      collectionId: 'test-collection-triple-id',
      entityId: createGeoId(),
      spaceId: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
    });

    createMany([
      {
        ...typeTriple,
        id: createTripleId({
          spaceId: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
          entityId: typeTriple.entityId,
          attributeId: typeTriple.attributeId,
        }),
        space: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
        attributeName: 'Some Attribute',
        entityName: 'Collection Entity A',
        value: {
          ...typeTriple.value,
          name: '',
        },
      },
      {
        ...collectionIdTriple,
        id: createTripleId({
          spaceId: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
          entityId: collectionIdTriple.entityId,
          attributeId: collectionIdTriple.attributeId,
        }),
        space: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
        attributeName: 'Some Attribute',
        entityName: 'Collection Entity A',
        value: {
          ...collectionIdTriple.value,
          name: '',
        },
      },
      {
        ...entityIdTriple,
        id: createTripleId({
          spaceId: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
          entityId: entityIdTriple.entityId,
          attributeId: entityIdTriple.attributeId,
        }),
        space: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
        attributeName: 'Some Attribute',
        entityName: 'Collection Entity A',
        value: {
          ...entityIdTriple.value,
          name: createGeoId(),
        },
      },
      {
        ...orderTriple,
        id: createTripleId({
          spaceId: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
          entityId: orderTriple.entityId,
          attributeId: orderTriple.attributeId,
        }),
        space: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
        attributeName: 'Some Attribute',
        entityName: 'Collection Entity A',
        value: {
          ...orderTriple.value,
        },
      },
    ]);
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

  const handleCollectionItemOrder = (collectionItemId: string, direction: 'up' | 'down') => {
    const items = orderedCollectionItems.map(c => c.collectionItemId);
    const position = items.indexOf(collectionItemId);

    let beforeItemIndex: number | undefined;
    let afterItemIndex: number | undefined;

    // We need to calculate what the new position is. Right now we're just
    // randomly re-ordering

    if (direction === 'up') {
      if (position === 0) {
        return;
      }

      beforeItemIndex = position - 2;
      afterItemIndex = position - 1;
    }

    if (direction === 'down') {
      if (position === items.length - 1) {
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

    // console.log('new index', {
    //   index: idk.value.value,
    //   position,
    //   beforeItemIndex,
    //   afterItemIndex,
    //   items,
    //   collectionItems,
    //   collectionItemId,
    // });

    const orderTripleForCollectionItem = collectionItems
      .get(collectionItemId)
      ?.find(t => t.attributeId === SYSTEM_IDS.COLLECTION_ITEM_INDEX);

    update(
      {
        ...newTripleOrdering,
        id: createTripleId({
          spaceId: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
          entityId: collectionItemId,
          attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
        }),
        space: '0xBED46b561c96602D142ceaE85285D051e2cC3Ac2',
        attributeName: 'Some Attribute',
        entityName: 'Collection Entity A',
      },
      orderTripleForCollectionItem! // We know this exists or it wouldn't be rendered
    );
  };

  return (
    <div>
      <div className="flex items-center gap-8">
        <button onClick={handleCreateCollectionTriple}>Create collection</button>
        <button onClick={handleCreateCollectionItem}>Create collection item</button>
      </div>

      <div className="flex flex-col">
        {orderedCollectionItems.map(c => {
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
                onClick={() => (collectionItemId ? handleCollectionItemOrder(collectionItemId, 'up') : undefined)}
              >
                Up
              </button>
              <button
                onClick={() => (collectionItemId ? handleCollectionItemOrder(collectionItemId, 'down') : undefined)}
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
