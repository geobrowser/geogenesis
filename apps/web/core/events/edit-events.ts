'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { createGeoId } from '@geogenesis/sdk';

import { useMemo } from 'react';

import { ID } from '~/core/id';
import { Value as IValue, Triple as TripleType, ValueType as TripleValueType } from '~/core/types';
import { Triples } from '~/core/utils/triples';
import { groupBy } from '~/core/utils/utils';
import { Values } from '~/core/utils/value';
import { valueTypeNames, valueTypes } from '~/core/value-types';

import { useWriteOps } from '../database/write';
import { Images } from '../utils/images';

export type EditEvent =
  | {
      type: 'UPSERT_TRIPLE_VALUE';
      payload: {
        triple: TripleType;
        value: IValue;
      };
    }
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
      type: 'DELETE_IMAGE_TRIPLE';
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
      // @TODO: Make this work with collections
      // @TODO: add support for preseving entity triple value when converting to collection
      type: 'CHANGE_TRIPLE_TYPE';
      payload: {
        type: TripleValueType;
        triple: TripleType;
      };
    }
  | {
      type: 'DELETE_ENTITY';
      payload: {
        triple: TripleType;
      };
    }
  | {
      type: 'DELETE_ENTITY_TRIPLE';
      payload: {
        triple: TripleType;
        isLastEntity: boolean;
      };
    }
  | {
      type: 'ADD_ATTRIBUTE_TO_TRIPLE';
      payload: {
        // We might be changing the attribute on an existing triple
        existingTriple?: TripleType;
        oldTriple: TripleType;
        newAttribute: {
          id: string;
          name: string | null;
        };
      };
    }
  | {
      type: 'ADD_PAGE_ENTITY_VALUE';
      payload: {
        shouldConvertToCollection: boolean;
        existingTriple: TripleType;
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
      type: 'CREATE_TEXT_TRIPLE_FROM_PLACEHOLDER';
      payload: {
        value: string;
        attributeId: string;
        attributeName: string | null;
      };
    }
  | {
      type: 'CREATE_URL_TRIPLE_FROM_PLACEHOLDER';
      payload: {
        value: string;
        attributeId: string;
        attributeName: string | null;
      };
    }
  | {
      type: 'CREATE_TIME_TRIPLE_FROM_PLACEHOLDER';
      payload: {
        value: string;
        attributeId: string;
        attributeName: string | null;
      };
    }
  | {
      type: 'CREATE_IMAGE_TRIPLE_FROM_PLACEHOLDER';
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
        attributeName: string | null;
      };
    }
  | {
      type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER';
      payload: {
        entityId: string;
        entityName: string | null;
        attributeId: string;
        attributeName: string | null;
      };
    }
  | {
      type: 'REMOVE_TRIPLE';
      payload: {
        triple: TripleType;
      };
    };

interface EditApi {
  upsertMany: ReturnType<typeof useWriteOps>['upsertMany'];
  upsert: ReturnType<typeof useWriteOps>['upsert'];
  remove: ReturnType<typeof useWriteOps>['remove'];
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
          {
            ...Triples.empty(context.spaceId, context.entityId),
            entityName: context.entityName,
          },
          context.spaceId
        );
      case 'REMOVE_TRIPLE':
        return remove(event.payload.triple, context.spaceId);
      case 'CHANGE_COLUMN_VALUE_TYPE': {
        const { valueType, valueTypeTriple, cellTriples } = event.payload;

        upsert(
          {
            ...valueTypeTriple,
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
            const migratedName = triples.map(triple => Values.nameOfEntityValue(triple)).join(', ');
            const isCellPopulated = triples.length > 0;

            if (!isCellPopulated) return;

            triples.forEach(triple => {
              remove(triple, context.spaceId);
            });

            const firstTriple = triples[0];

            upsert(
              {
                ...firstTriple,
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
        const { type, triple } = event.payload;
        const value = Triples.emptyValue(type);
        return upsert(
          {
            ...triple,
            value,
          },
          context.spaceId
        );
      }
      // @TODO: Do we need both of these delete events?
      case 'DELETE_ENTITY': {
        const { triple } = event.payload;
        return remove(triple, context.spaceId);
      }
      case 'DELETE_ENTITY_TRIPLE': {
        const { triple, isLastEntity } = event.payload;

        if (triple.value.type === 'ENTITY') {
          // When we remove the last linked entity, we just want to create a new, empty triple.
          // This is so we can keep the Attribute field available for the user to add a new entity
          // if they want to replace the one they just deleted.
          if (isLastEntity) {
            upsert(
              {
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

        break;
      }
      case 'ADD_ATTRIBUTE_TO_TRIPLE': {
        const { newAttribute, existingTriple, oldTriple } = event.payload;

        // Need to delete the old representation of the triple since
        // the attribute changed.
        remove(
          {
            attributeId: oldTriple.attributeId,
            entityId: context.entityId,
          },
          context.spaceId
        );

        upsert(
          {
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId: newAttribute.id,
            attributeName: newAttribute.name,
            value: existingTriple ? existingTriple.value : oldTriple.value,
          },
          context.spaceId
        );

        break;
      }
      case 'ADD_PAGE_ENTITY_VALUE': {
        const { existingTriple, attribute, linkedEntity, entityName, shouldConvertToCollection } = event.payload;

        // @TODO: Handle converting a new entity value triple to a collection

        // This first if clause handles the case when we delete an entity value triple and
        // there’s no entity value triples left, but we want to keep the
        // field in place for better UX in the entity page
        if (existingTriple.value.type === 'ENTITY' && !existingTriple.value.value) {
          return upsert(
            {
              ...existingTriple,
              value: {
                type: 'ENTITY',
                value: linkedEntity.id,
                name: linkedEntity.name,
              },
              attributeName: existingTriple.attributeName,
              entityName: entityName,
            },
            context.spaceId
          );
        }

        return upsert(
          {
            entityId: context.entityId,
            entityName: entityName,
            attributeId: attribute.id,
            attributeName: existingTriple.attributeName,
            value: {
              type: 'ENTITY',
              value: linkedEntity.id,
              name: linkedEntity.name,
            },
          },
          context.spaceId
        );
      }
      // These CREATE_X_TRIPLE_WITH_VALUE events turn a placeholder/empty triple
      // into a "real" triple
      case 'CREATE_TEXT_TRIPLE_FROM_PLACEHOLDER': {
        const { value, attributeId, attributeName } = event.payload;

        return upsert(
          {
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
      case 'CREATE_URL_TRIPLE_FROM_PLACEHOLDER': {
        const { value, attributeId, attributeName } = event.payload;

        if (!value) return;

        return upsert(
          {
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'URI',
              value: value,
            },
          },
          context.spaceId
        );
      }
      case 'CREATE_TIME_TRIPLE_FROM_PLACEHOLDER': {
        const { value, attributeId, attributeName } = event.payload;

        if (!value) return;

        return upsert(
          {
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
      case 'CREATE_IMAGE_TRIPLE_FROM_PLACEHOLDER': {
        const { imageSrc, attributeId, attributeName } = event.payload;

        if (!imageSrc) return;

        const [typeTriple, urlTriple] = Images.createImageEntityTriples({
          imageSource: Values.toImageValue(imageSrc),
          spaceId: context.spaceId,
        });

        return upsertMany(
          [
            // Create the image entity
            typeTriple,
            urlTriple,

            // Set the image entity reference on the current entity
            {
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
          ],
          context.spaceId
        );
      }
      case 'CREATE_ENTITY_TRIPLE': {
        const { attributeId, attributeName } = event.payload;
        return upsert(
          {
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
      case 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER': {
        const { entityId, entityName, attributeId, attributeName } = event.payload;

        return upsert(
          {
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
        const newAttributeTriple = Triples.withId({
          space: context.spaceId,
          entityId: ID.createEntityId(),
          entityName: '',
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Types',
          value: { value: SYSTEM_IDS.ATTRIBUTE, type: 'ENTITY', name: 'Attribute' },
        });

        const newAttributeNameTriple = Triples.withId({
          space: context.spaceId,
          entityId: newAttributeTriple.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { type: 'TEXT', value: '' },
        });

        const newTypeTriple = Triples.withId({
          space: context.spaceId,
          entityId: context.entityId,
          entityName: context.entityName,
          attributeId: SYSTEM_IDS.ATTRIBUTES,
          attributeName: 'Attributes',
          value: { value: newAttributeTriple.entityId, type: 'ENTITY', name: newAttributeNameTriple.entityName },
        });

        const newValueTypeTriple = Triples.withId({
          space: context.spaceId,
          entityId: newAttributeTriple.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.VALUE_TYPE,
          attributeName: 'Value type',
          value: { value: SYSTEM_IDS.TEXT, type: 'ENTITY', name: 'Text' },
        });

        return upsertMany(
          [newAttributeNameTriple, newAttributeTriple, newValueTypeTriple, newTypeTriple],
          context.spaceId
        );
      }
      case 'UPSERT_TRIPLE_VALUE': {
        const { value, triple } = event.payload;

        return upsert(
          {
            ...triple,
            value,
          },
          context.spaceId
        );
      }

      case 'DELETE_IMAGE_TRIPLE': {
        const { triple } = event.payload;
        return remove(triple, context.spaceId);
      }
      case 'UPLOAD_IMAGE': {
        const { imageSrc, triple } = event.payload;

        // @TODO: Also create the entity that stores the image
        return upsert(
          {
            ...triple,
            value: {
              type: 'IMAGE',
              value: createGeoId(),
              image: Values.toImageValue(imageSrc),
            },
          },
          context.spaceId
        );
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
