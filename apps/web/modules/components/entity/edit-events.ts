import { SYSTEM_IDS } from '@geogenesis/ids';
import { useMemo } from 'react';

import { EntityStore } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { emptyValue } from '~/modules/triple/triple';
import { Triple as TripleType, TripleValueType } from '~/modules/types';
import { groupBy } from '~/modules/utils';
import { Value } from '~/modules/value';
import { valueTypeNames, valueTypes } from '~/modules/value-types';

export type EditEvent =
  | {
      type: 'EDIT_ENTITY_NAME';
      payload: {
        name: string;
        triple?: TripleType;
      };
    }
  | {
      type: 'EDIT_ENTITY_DESCRIPTION';
      payload: {
        name: string;
        description: string;
        triple?: TripleType;
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
      type: 'UPDATE_VALUE';
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
  create: EntityStore['create'];
  update: EntityStore['update'];
  remove: EntityStore['remove'];
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
  ({ api: { create, update, remove }, context }: ListenerConfig) =>
  (event: EditEvent) => {
    switch (event.type) {
      case 'EDIT_ENTITY_NAME': {
        const { name, triple } = event.payload;

        if (!triple) {
          return create(
            Triple.withId({
              space: context.spaceId,
              entityId: context.entityId,
              entityName: name,
              attributeId: SYSTEM_IDS.NAME,
              attributeName: 'Name',
              value: { id: ID.createValueId(), type: 'string', value: name },
            })
          );
        }

        return update(
          Triple.ensureStableId({
            ...triple,
            entityName: name,
            value: { ...triple.value, type: 'string', value: name },
          }),
          triple
        );
      }
      case 'EDIT_ENTITY_DESCRIPTION': {
        const { name, description, triple } = event.payload;

        if (!triple) {
          return create(
            Triple.withId({
              space: context.spaceId,
              entityId: context.entityId,
              attributeId: SYSTEM_IDS.DESCRIPTION,
              attributeName: SYSTEM_IDS.DESCRIPTION,
              entityName: name,
              value: {
                id: ID.createValueId(),
                type: 'string',
                value: description,
              },
            })
          );
        }

        return update(
          Triple.ensureStableId({
            ...triple,
            value: { ...triple.value, type: 'string', value: description },
          }),
          triple
        );
      }
      case 'CREATE_NEW_TRIPLE':
        return create({ ...Triple.empty(context.spaceId, context.entityId), entityName: context.entityName });
      case 'REMOVE_TRIPLE':
        return remove(event.payload.triple);
      case 'CHANGE_COLUMN_VALUE_TYPE': {
        const { valueType, valueTypeTriple, cellTriples } = event.payload;

        update(
          Triple.ensureStableId({
            ...valueTypeTriple,
            value: {
              type: 'entity',
              id: valueType,
              name: valueTypeNames[valueType],
            },
          }),
          valueTypeTriple
        );

        const isRelationValueType = valueType === SYSTEM_IDS.RELATION;
        const isTextValueType = valueType === SYSTEM_IDS.TEXT;

        if (isTextValueType) {
          // Handles the case when the column is changed from relation to text.
          // Former entities values join into one string value separated by a comma
          // e.g. San Francisco and New York entities transform into a single string value "San Francisco, New York"

          const cellTriplesByRow = Object.values(groupBy(cellTriples, triple => triple.entityId));

          return cellTriplesByRow.forEach(triples => {
            const migratedName = triples.map(triple => Value.nameOfEntityValue(triple)).join(', ');
            const isCellPopulated = triples.length > 0;

            if (!isCellPopulated) return;

            triples.forEach(triple => {
              remove(triple);
            });

            const firstTriple = triples[0];

            create(
              Triple.withId({
                ...firstTriple,
                value: { id: ID.createValueId(), type: 'string', value: migratedName },
              })
            );
          });
        } else if (isRelationValueType) {
          // Handles the case when the column is changed from text to relation.
          return cellTriples.forEach(triple => remove(triple));
        } else {
          return;
        }
      }
      case 'CHANGE_TRIPLE_TYPE': {
        const { type, triples } = event.payload;

        const value = emptyValue(type);

        return triples.forEach(triple => {
          const isString = type === 'string';
          const isImage = type === 'image';

          const retainTripleValueId = isString || isImage;

          const newValue = retainTripleValueId ? { ...value, id: triple.value.id } : value;

          update(
            Triple.ensureStableId({
              ...triple,
              value: newValue,
            }),
            triple
          );
        });
      }

      case 'REMOVE_ENTITY': {
        const { triple } = event.payload;

        return remove(triple);
      }

      case 'REMOVE_PAGE_ENTITY': {
        const { triple, isLastEntity } = event.payload;

        if (triple.value.type === 'entity') {
          // When we remove the last linked entity, we just want to create a new, empty triple.
          // This is so we can keep the Attribute field available for the user to add a new entity
          // if they want to replace the one they just deleted.
          if (isLastEntity) {
            create({
              ...Triple.empty(triple.space, triple.entityId),
              entityName: triple.entityName,
              attributeId: triple.attributeId,
              attributeName: triple.attributeName,
              value: { id: '', type: 'entity', name: '' },
            });
          }
        }

        return remove(triple);
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
            const newTriple = Triple.ensureStableId({
              ...triple,
              attributeId: newAttribute.id,
              attributeName: newAttribute.name,
            });

            update(newTriple, triple);
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
          triplesByAttributeId[attribute.id][0].value.type === 'entity' &&
          !triplesByAttributeId[attribute.id][0].value.id
        ) {
          return update(
            Triple.ensureStableId({
              ...triplesByAttributeId[attribute.id][0],
              value: {
                ...triplesByAttributeId[attribute.id][0].value,
                type: 'entity',
                id: linkedEntity.id,
                name: linkedEntity.name,
              },
              attributeName: triplesByAttributeId[attribute.id][0].attributeName,
              entityName: entityName,
            }),
            triplesByAttributeId[attribute.id][0]
          );
        }

        return create(
          Triple.withId({
            space: context.spaceId,
            entityId: context.entityId,
            entityName: entityName,
            attributeId: attribute.id,
            attributeName: triplesByAttributeId[attribute.id][0].attributeName,
            value: {
              type: 'entity',
              id: linkedEntity.id,
              name: linkedEntity.name,
            },
          })
        );
      }
      case 'CREATE_STRING_TRIPLE_WITH_VALUE': {
        const { value, attributeId, attributeName } = event.payload;

        if (!value) return;

        return create(
          Triple.withId({
            space: context.spaceId,
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId,
            attributeName,
            value: {
              type: 'string',
              id: ID.createValueId(),
              value: value,
            },
          })
        );
      }

      case 'CREATE_ENTITY_TRIPLE_WITH_VALUE': {
        const { entityId, entityName, attributeId, attributeName } = event.payload;

        return create(
          Triple.withId({
            space: context.spaceId,
            entityId: context.entityId,
            entityName: context.entityName,
            attributeId: attributeId,
            attributeName: attributeName,
            placeholder: false,
            value: {
              type: 'entity',
              id: entityId,
              name: entityName,
            },
          })
        );
      }

      case 'ADD_NEW_COLUMN': {
        const newAttributeTriple = Triple.withId({
          space: context.spaceId,
          entityId: ID.createEntityId(),
          entityName: '',
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Type',
          value: { id: SYSTEM_IDS.ATTRIBUTE, type: 'entity', name: 'Attribute' },
        });

        const newAttributeNameTriple = Triple.withId({
          space: context.spaceId,
          entityId: newAttributeTriple.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.NAME,
          attributeName: 'Name',
          value: { id: ID.createValueId(), type: 'string', value: '' },
        });

        const newTypeTriple = Triple.withId({
          space: context.spaceId,
          entityId: context.entityId,
          entityName: context.entityName,
          attributeId: SYSTEM_IDS.ATTRIBUTES,
          attributeName: 'Attributes',
          value: { id: newAttributeTriple.entityId, type: 'entity', name: newAttributeNameTriple.entityName },
        });

        const newValueTypeTriple = Triple.withId({
          space: context.spaceId,
          entityId: newAttributeTriple.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.VALUE_TYPE,
          attributeName: 'Value type',
          value: { id: SYSTEM_IDS.TEXT, type: 'entity', name: 'Text' },
        });

        create(newAttributeNameTriple);
        create(newAttributeTriple);
        create(newValueTypeTriple);
        return create(newTypeTriple);
      }

      case 'UPDATE_VALUE': {
        const { value, triple } = event.payload;

        return update(
          {
            ...triple,
            placeholder: false,
            value: { ...triple.value, type: 'string', value },
          },
          triple
        );
      }

      case 'REMOVE_IMAGE': {
        const { triple } = event.payload;
        const newValue = { ...triple.value, value: '' };

        return update(
          Triple.ensureStableId({
            ...triple,
            value: newValue,
          }),
          triple
        );
      }

      case 'UPLOAD_IMAGE': {
        const { imageSrc, triple } = event.payload;
        const newValue = { ...triple.value, value: imageSrc };

        return update(
          Triple.ensureStableId({
            ...triple,
            value: newValue,
          }),
          triple
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
