'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';

import { useMemo } from 'react';

import { ID } from '~/core/id';
import { AppEntityValue, Triple as TripleType, ValueType as TripleValueType } from '~/core/types';
import { Triple } from '~/core/utils/triple';
import { groupBy } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';
import { valueTypeNames, valueTypes } from '~/core/value-types';

import { useActionsStore } from '../hooks/use-actions-store';

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
    };

interface EditApi {
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
  ({ api: { upsert, remove }, context }: ListenerConfig) =>
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
              id: valueType,
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
                value: { id: '', type: 'ENTITY', name: '' },
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
          !(triplesByAttributeId[attribute.id][0].value as AppEntityValue).id
        ) {
          return upsert(
            {
              ...triplesByAttributeId[attribute.id][0],
              type: 'SET_TRIPLE',
              value: {
                type: 'ENTITY',
                id: linkedEntity.id,
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
              id: linkedEntity.id,
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

        return upsert(
          {
            type: 'SET_TRIPLE',
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'IMAGE',
              value: Value.toImageValue(imageSrc),
            },
          },
          context.spaceId
        );
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
              id: '',
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
              id: entityId,
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
          value: { id: SYSTEM_IDS.ATTRIBUTE, type: 'ENTITY', name: 'Attribute' },
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
          value: { id: newAttributeTriple.entityId, type: 'ENTITY', name: newAttributeNameTriple.entityName },
        });

        const newValueTypeTriple = Triple.withId({
          space: context.spaceId,
          entityId: newAttributeTriple.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.VALUE_TYPE,
          attributeName: 'Value type',
          value: { id: SYSTEM_IDS.TEXT, type: 'ENTITY', name: 'Text' },
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

        return upsert(
          {
            ...triple,
            type: 'SET_TRIPLE',
            value: {
              type: 'IMAGE',
              value: Value.toImageValue(imageSrc),
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
