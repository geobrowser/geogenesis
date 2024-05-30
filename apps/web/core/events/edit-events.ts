'use client';

import { SYSTEM_IDS, createCollection } from '@geogenesis/sdk';
import { createCollectionItem, createGeoId, createImageEntityOps } from '@geogenesis/sdk';

import { useMemo } from 'react';

import { ID } from '~/core/id';
import {
  EntitySearchResult,
  Triple as TripleType,
  ValueType as TripleValueType,
  TripleWithCollectionValue,
} from '~/core/types';
import { Triple } from '~/core/utils/triple';
import { groupBy } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';
import { valueTypeNames, valueTypes } from '~/core/value-types';

import { useActionsStore } from '../hooks/use-actions-store';
import { StoreOp } from '../state/actions-store/actions-store';
import { Collections } from '../utils/collections';
import { Images } from '../utils/images';

export type EditEvent =
  | {
      type: 'EDIT_ENTITY_NAME';
      payload: {
        name: string;
      };
    }
  | {
      type: 'EDIT_ENTITY_DESCRIPTION';
      payload: {
        name: string;
        description: string;
      };
    }
  | {
      type: 'CREATE_NEW_TRIPLE';
    }
  | {
      type: 'UPLOAD_IMAGE';
      payload: {
        triple: TripleType;
        imageSrc: string;
      };
    }
  | {
      type: 'REMOVE_IMAGE';
      payload: {
        triple: TripleType;
      };
    }
  | {
      type: 'CHANGE_COLUMN_VALUE_TYPE';
      payload: {
        valueTypeTriple: TripleType;
        cellTriples: TripleType[];
        valueType: keyof typeof valueTypes;
      };
    }
  | {
      type: 'CHANGE_TRIPLE_TYPE';
      payload: {
        type: TripleValueType;
        triples: TripleType[];
      };
    }
  | {
      type: 'REMOVE_ENTITY';
      payload: {
        triple: TripleType;
      };
    }
  | {
      type: 'REMOVE_PAGE_ENTITY';
      payload: {
        triple: TripleType;
        isLastEntity: boolean;
      };
    }
  | {
      type: 'LINK_ATTRIBUTE';
      payload: {
        triplesByAttributeId: Record<string, TripleType[]>;
        oldAttribute: {
          id: string;
        };
        newAttribute: {
          id: string;
          name: string | null;
        };
      };
    }
  | {
      type: 'ADD_PAGE_ENTITY_VALUE';
      payload: {
        triplesByAttributeId: Record<string, TripleType[]>;
        attribute: {
          id: string;
        };
        linkedEntity: {
          id: string;
          name: string | null;
        };
        entityName: string;
      };
    }
  | {
      type: 'ADD_NEW_COLUMN';
    }
  | {
      type: 'UPDATE_STRING_VALUE';
      payload: {
        value: string;
        triple: TripleType;
      };
    }
  | {
      type: 'UPDATE_URL_VALUE';
      payload: {
        value: string;
        triple: TripleType;
      };
    }
  | {
      type: 'UPDATE_DATE_VALUE';
      payload: {
        value: string;
        triple: TripleType;
      };
    }
  | {
      type: 'CREATE_STRING_TRIPLE_WITH_VALUE';
      payload: {
        value: string;
        attributeId: string;
        attributeName: string;
      };
    }
  | {
      type: 'CREATE_URL_TRIPLE_WITH_VALUE';
      payload: {
        value: string;
        attributeId: string;
        attributeName: string;
      };
    }
  | {
      type: 'CREATE_DATE_TRIPLE_WITH_VALUE';
      payload: {
        value: string;
        attributeId: string;
        attributeName: string;
      };
    }
  | {
      type: 'CREATE_IMAGE_TRIPLE_WITH_VALUE';
      payload: {
        imageSrc: string;
        attributeId: string;
        attributeName: string;
      };
    }
  | {
      type: 'CREATE_ENTITY_TRIPLE';
      payload: {
        attributeId: string;
        attributeName: string;
      };
    }
  | {
      type: 'CREATE_ENTITY_TRIPLE_WITH_VALUE';
      payload: {
        entityId: string;
        entityName: string;
        attributeId: string;
        attributeName: string;
      };
    }
  | {
      type: 'REMOVE_TRIPLE';
      payload: {
        triple: TripleType;
      };
    }
  | {
      type: 'CREATE_COLLECTION_ITEM';
      payload: {
        collectionId: string;
        entity: EntitySearchResult;
        collectionTriple: TripleWithCollectionValue;
      };
    }
  | {
      type: 'DELETE_COLLECTION_ITEM';
      payload: {
        collectionItemId: string;
        collectionTriple: TripleWithCollectionValue;
      };
    }
  | {
      // This occurs automatically when the user adds a second image
      // in the UI. We automatically take the first image and the new
      // image and add them to a newly created collection.
      type: 'CONVERT_IMAGE_TO_IMAGE_COLLECTION';
      payload: {
        // The entity ids of the original image and the new image
        // being created
        entityIds: string[];

        // The attribute for the triple we're making a collection for
        attribute: {
          id: string;
          name: string | null;
        };
      };
    }
  | {
      // This occurs automatically when the user toggles the Many/One
      // toggle to a One. We delete the collection and collection items
      // associated with the image collection and create a new IMAGE
      // triple with just the entity id of the image being used.
      //
      // If there is no first image we create a placeholder image triple.
      type: 'CONVERT_IMAGE_COLLECTION_TO_IMAGE';
      payload: {
        entityId: string;
        value: string;
      } | null;
    };

interface EditApi {
  upsertMany: ReturnType<typeof useActionsStore>['upsertMany'];
  upsert: ReturnType<typeof useActionsStore>['upsert'];
  remove: ReturnType<typeof useActionsStore>['remove'];
}

interface ListenerConfig {
  api: EditApi;
  context: {
    spaceId: string;
    entityId: string;
    entityName: string;
  };
}

const listener =
  ({ api: { upsert, remove, upsertMany }, context }: ListenerConfig) =>
  (event: EditEvent) => {
    switch (event.type) {
      case 'EDIT_ENTITY_NAME': {
        const { name } = event.payload;

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: name,
            attributeId: SYSTEM_IDS.NAME,
            attributeName: 'Name',
            value: { type: 'TEXT', value: name },
          },
          context.spaceId
        );
      }
      case 'EDIT_ENTITY_DESCRIPTION': {
        const { name, description } = event.payload;

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            attributeId: SYSTEM_IDS.DESCRIPTION,
            attributeName: SYSTEM_IDS.DESCRIPTION,
            entityName: name,
            value: {
              type: 'TEXT',
              value: description,
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_NEW_TRIPLE':
        return upsert(
          { ...Triple.empty(context.spaceId, context.entityId), entityName: context.entityName, type: 'SET_TRIPLE' },
          context.spaceId
        );
      case 'REMOVE_TRIPLE':
        return remove(event.payload.triple, context.spaceId);
      case 'CHANGE_COLUMN_VALUE_TYPE': {
        const { valueType, valueTypeTriple, cellTriples } = event.payload;

        upsert(
          {
            ...valueTypeTriple,
            type: 'SET_TRIPLE',
            value: {
              type: 'ENTITY',
              value: valueType,
              name: valueTypeNames[valueType],
            },
          },
          context.spaceId
        );

        const currentType = cellTriples[0]?.value.type;
        const isRelationFromRelationToText = currentType === 'ENTITY' && valueType === SYSTEM_IDS.TEXT;

        if (isRelationFromRelationToText) {
          // Handles the case when the column is changed from relation to text.
          // Former entities values join into one string value separated by a comma
          // e.g. San Francisco and New York entities transform into a single string value "San Francisco, New York"

          const cellTriplesByRow = Object.values(groupBy(cellTriples, triple => triple.entityId));

          return cellTriplesByRow.forEach(triples => {
            const migratedName = triples.map(triple => Value.nameOfEntityValue(triple)).join(', ');
            const isCellPopulated = triples.length > 0;

            if (!isCellPopulated) return;

            triples.forEach(triple => {
              remove(triple, context.spaceId);
            });

            const firstTriple = triples[0];

            upsert(
              {
                ...firstTriple,
                type: 'SET_TRIPLE',
                value: { type: 'TEXT', value: migratedName },
              },
              context.spaceId
            );
          });
        } else {
          return cellTriples.forEach(triple => remove(triple, context.spaceId));
        }
      }
      case 'CHANGE_TRIPLE_TYPE': {
        const { type, triples } = event.payload;
        const value = Triple.emptyValue(type);
        return triples.forEach(triple => {
          upsert(
            {
              ...triple,
              value,
              type: 'SET_TRIPLE',
            },
            context.spaceId
          );
        });
      }
      case 'REMOVE_ENTITY': {
        const { triple } = event.payload;
        return remove(triple, context.spaceId);
      }
      case 'REMOVE_PAGE_ENTITY': {
        const { triple, isLastEntity } = event.payload;

        if (triple.value.type === 'ENTITY') {
          // When we remove the last linked entity, we just want to create a new, empty triple.
          // This is so we can keep the Attribute field available for the user to add a new entity
          // if they want to replace the one they just deleted.
          if (isLastEntity) {
            upsert(
              {
                type: 'SET_TRIPLE',
                entityId: triple.entityId,
                entityName: triple.entityName,
                attributeId: triple.attributeId,
                attributeName: triple.attributeName,
                value: { value: '', type: 'ENTITY', name: '' },
              },
              context.spaceId
            );
          }
        } else {
          remove(triple, context.spaceId);
        }

        return;
      }
      case 'LINK_ATTRIBUTE': {
        const { newAttribute, oldAttribute, triplesByAttributeId } = event.payload;
        const triplesToUpdate = triplesByAttributeId[oldAttribute.id];

        if (triplesToUpdate.length > 0) {
          if (triplesByAttributeId[newAttribute.id]?.length > 0) {
            // If triples at the new id already exists we want the user to use the existing entry method
            return;
          }

          triplesToUpdate.forEach(triple => {
            upsert(
              {
                ...triple,
                attributeId: newAttribute.id,
                attributeName: newAttribute.name,
                type: 'SET_TRIPLE',
              },
              context.spaceId
            );
          });
        }

        break;
      }
      case 'ADD_PAGE_ENTITY_VALUE': {
        const { triplesByAttributeId, attribute, linkedEntity, entityName } = event.payload;

        // This first if clause handles the case when we delete an entity value triple and
        // there’s no entity value triples left, but we want to keep the
        // field in place for better UX in the entity page
        if (
          triplesByAttributeId[attribute.id]?.length === 1 &&
          triplesByAttributeId[attribute.id][0].value.type === 'ENTITY' &&
          !triplesByAttributeId[attribute.id][0].value.value
        ) {
          return upsert(
            {
              ...triplesByAttributeId[attribute.id][0],
              type: 'SET_TRIPLE',
              value: {
                type: 'ENTITY',
                value: linkedEntity.id,
                name: linkedEntity.name,
              },
              attributeName: triplesByAttributeId[attribute.id][0].attributeName,
              entityName: entityName,
            },
            context.spaceId
          );
        }

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: entityName,
            attributeId: attribute.id,
            attributeName: triplesByAttributeId[attribute.id][0].attributeName,
            value: {
              type: 'ENTITY',
              value: linkedEntity.id,
              name: linkedEntity.name,
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_STRING_TRIPLE_WITH_VALUE': {
        const { value, attributeId, attributeName } = event.payload;
        if (!value) return;

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'TEXT',
              value: value,
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_URL_TRIPLE_WITH_VALUE': {
        const { value, attributeId, attributeName } = event.payload;

        if (!value) return;

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'URL',
              value: value,
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_DATE_TRIPLE_WITH_VALUE': {
        const { value, attributeId, attributeName } = event.payload;

        if (!value) return;

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'TIME',
              value: value,
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_IMAGE_TRIPLE_WITH_VALUE': {
        const { imageSrc, attributeId, attributeName } = event.payload;

        if (!imageSrc) return;

        const [typeTriple, urlTriple] = Images.createImageEntityTriples({
          imageSource: Value.toImageValue(imageSrc),
          spaceId: context.spaceId,
        });

        return upsertMany([
          // Create the image entity
          {
            op: { ...typeTriple, type: 'SET_TRIPLE' },
            spaceId: context.spaceId,
          },
          {
            op: { ...urlTriple, type: 'SET_TRIPLE' },
            spaceId: context.spaceId,
          },

          // Set the image entity reference on the current entity
          {
            spaceId: context.spaceId,
            op: {
              type: 'SET_TRIPLE',
              entityId: context.entityId,
              entityName: context.entityName,
              attributeId,
              attributeName,
              value: {
                type: 'IMAGE',
                value: typeTriple.entityId,
                image: urlTriple.value.value,
              },
            },
          },
        ]);
      }
      case 'CREATE_ENTITY_TRIPLE': {
        const { attributeId, attributeName } = event.payload;
        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'ENTITY',
              value: '',
              name: '',
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_ENTITY_TRIPLE_WITH_VALUE': {
        const { entityId, entityName, attributeId, attributeName } = event.payload;

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'ENTITY',
              value: entityId,
              name: entityName,
            },
          },
          context.spaceId
        );
      }
      case 'ADD_NEW_COLUMN': {
        const newAttributeTriple = Triple.withId({
          space: context.spaceId,
          entityId: ID.createEntityId(),
          entityName: '',
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          value: { value: SYSTEM_IDS.ATTRIBUTE, type: 'ENTITY', name: 'Attribute' },
        });

        const newAttributeNameTriple = Triple.withId({
          space: context.spaceId,
          entityId: newAttributeTriple.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { type: 'TEXT', value: '' },
        });

        const newTypeTriple = Triple.withId({
          space: context.spaceId,
          entityId: context.entityId,
          entityName: context.entityName,
          attributeId: SYSTEM_IDS.ATTRIBUTES,
          attributeName: 'Attributes',
          value: { value: newAttributeTriple.entityId, type: 'ENTITY', name: newAttributeNameTriple.entityName },
        });

        const newValueTypeTriple = Triple.withId({
          space: context.spaceId,
          entityId: newAttributeTriple.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.VALUE_TYPE,
          attributeName: 'Value type',
          value: { value: SYSTEM_IDS.TEXT, type: 'ENTITY', name: 'Text' },
        });

        upsert({ ...newAttributeNameTriple, type: 'SET_TRIPLE' }, context.spaceId);
        upsert({ ...newAttributeTriple, type: 'SET_TRIPLE' }, context.spaceId);
        upsert({ ...newValueTypeTriple, type: 'SET_TRIPLE' }, context.spaceId);
        return upsert({ ...newTypeTriple, type: 'SET_TRIPLE' }, context.spaceId);
      }
      case 'UPDATE_STRING_VALUE': {
        const { value, triple } = event.payload;

        return upsert(
          {
            ...triple,
            type: 'SET_TRIPLE',
            value: { type: 'TEXT', value },
          },
          context.spaceId
        );
      }
      case 'UPDATE_URL_VALUE': {
        const { value, triple } = event.payload;

        return upsert(
          {
            ...triple,
            type: 'SET_TRIPLE',
            value: { type: 'URL', value },
          },
          context.spaceId
        );
      }
      case 'UPDATE_DATE_VALUE': {
        const { value, triple } = event.payload;

        return upsert(
          {
            ...triple,
            type: 'SET_TRIPLE',
            value: { type: 'TIME', value },
          },
          context.spaceId
        );
      }
      case 'REMOVE_IMAGE': {
        const { triple } = event.payload;
        return remove(triple, context.spaceId);
      }
      case 'UPLOAD_IMAGE': {
        const { imageSrc, triple } = event.payload;

        // @TODO: Also create the entity that stores the image

        return upsert(
          {
            ...triple,
            type: 'SET_TRIPLE',
            value: {
              type: 'IMAGE',
              value: createGeoId(),
              image: Value.toImageValue(imageSrc),
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_COLLECTION_ITEM': {
        const { collectionId, entity, collectionTriple } = event.payload;
        const { spaceId } = context;

        const triples = Collections.createCollectionItemTriples({
          collectionId,
          entityId: entity.id,
          spaceId,
        });

        const newCollectionTriple: TripleWithCollectionValue = {
          ...collectionTriple,
          value: {
            ...collectionTriple.value,
            items: [
              ...collectionTriple.value.items,
              {
                collectionId: collectionTriple.entityId,
                entity: {
                  id: entity.id,
                  name: entity.name,
                  types: [],
                },
                id: triples[0].entityId,
                index: triples[3].value.value,
                value: {
                  type: 'ENTITY',
                  value: entity.name,
                },
              },
            ],
          },
        };

        return upsertMany(
          [...triples, newCollectionTriple].map(t => {
            return {
              spaceId: t.space,
              op: {
                ...t,
                type: 'SET_TRIPLE',
              },
            };
          })
        );
      }
      case 'DELETE_COLLECTION_ITEM': {
        const { collectionItemId, collectionTriple } = event.payload;
        const { spaceId } = context;

        remove(
          {
            attributeId: SYSTEM_IDS.COLLECTION_ITEM_TYPE,
            entityId: collectionItemId,
          },
          spaceId
        );
        remove(
          {
            attributeId: SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
            entityId: collectionItemId,
          },
          spaceId
        );
        remove(
          {
            attributeId: SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
            entityId: collectionItemId,
          },
          spaceId
        );
        remove(
          {
            attributeId: SYSTEM_IDS.COLLECTION_ITEM_INDEX,
            entityId: collectionItemId,
          },
          spaceId
        );

        const newCollectionTriple: TripleWithCollectionValue = {
          ...collectionTriple,
          value: {
            ...collectionTriple.value,
            items: collectionTriple.value.items.filter(i => i.id !== collectionItemId),
          },
        };

        return upsert({ ...newCollectionTriple, type: 'SET_TRIPLE' }, spaceId);
      }
      // This occurs automatically when the user adds a second image
      // in the UI. We automatically take the first image and the new
      // image and add them to a newly created collection.
      case 'CONVERT_IMAGE_TO_IMAGE_COLLECTION': {
        const { entityIds, attribute } = event.payload;
        const { spaceId, entityId, entityName } = context;

        const collection = createCollection();

        const collectionOp: StoreOp = {
          attributeId: collection.payload.attributeId,
          entityId: collection.payload.entityId,
          attributeName: 'Types',
          entityName: null,
          type: 'SET_TRIPLE',
          value: {
            type: collection.payload.value.type,
            value: collection.payload.value.value,
            name: null,
          },
        };

        // @TODO: if entityIds is 0 then skip and make the triple a placeholder.
        // We can receive 0 entity ids if the user manually decides to create
        // a brand new triple as a collection and not a single IMAGE/ENTITY.
        //
        // Create all of the triples for all of the new collection items
        const collectionItemsTriples = entityIds
          .map(id =>
            Collections.createCollectionItemTriples({
              collectionId: collection.payload.entityId,
              entityId: id,
              spaceId,
            })
          )
          .flat();

        // Map all of the triples for a collection item into the CollectionItem
        // data structure so it's easy to read later.
        const collectionItemsFromTriples = Collections.itemFromTriples(
          groupBy(collectionItemsTriples, t => t.entityId)
        );

        // @TODO: Make collection triple from the images
        const newCollectionTriple: { op: StoreOp; spaceId: string } = {
          op: {
            type: 'SET_TRIPLE',
            attributeId: attribute.id,
            attributeName: attribute.name,
            entityId,
            entityName,
            value: {
              type: 'COLLECTION',
              value: collection.payload.entityId,
              items: collectionItemsFromTriples,
            },
          },
          spaceId,
        };

        const collectionItemTriplesAsStoreOps = collectionItemsTriples.map((t): { op: StoreOp; spaceId: string } => {
          return {
            op: {
              ...t,
              type: 'SET_TRIPLE',
            },
            spaceId,
          };
        });

        upsertMany([
          {
            op: collectionOp,
            spaceId,
          },
          ...collectionItemTriplesAsStoreOps,
          newCollectionTriple,
        ]);
      }
      case 'CONVERT_IMAGE_COLLECTION_TO_IMAGE': {
        throw new Error('CONVERT_IMAGE_COLLECTION_TO_IMAGE not implemented');
      }
    }
  };

export function useEditEvents(config: ListenerConfig) {
  // TODO: Only create config when content changes
  const send = useMemo(() => {
    return listener(config);
  }, [config]);

  return send;
}
