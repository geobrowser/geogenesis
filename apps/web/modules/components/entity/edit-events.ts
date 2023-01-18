import { SYSTEM_IDS } from '@geogenesis/ids';
import { useMemo } from 'react';
import { EntityStore } from '~/modules/entity';
import { ID } from '~/modules/id';
import { Triple } from '~/modules/triple';
import { Triple as TripleType } from '~/modules/types';

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
      type: 'CHANGE_TRIPLE_TYPE';
      payload: {
        type: 'string' | 'entity';
        triples: TripleType[];
      };
    }
  | {
      type: 'REMOVE_ENTITY';
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
      type: 'ADD_ENTITY_VALUE';
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
      type: 'UPDATE_VALUE';
      payload: {
        value: string;
        triple: TripleType;
      };
    }
  | {
      type: 'CREATE_STRING_TRIPLE_FROM_PLACEHOLDER';
      payload: {
        value: string;
        triple: TripleType;
      };
    }
  | {
      type: 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER';
      payload: {
        entityId: string;
        entityName: string;
        triple: TripleType;
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
      case 'CHANGE_TRIPLE_TYPE': {
        const { type, triples } = event.payload;

        return triples.forEach(triple => {
          update(
            Triple.ensureStableId({
              ...triple,
              value: {
                ...(type === 'entity'
                  ? { type: 'entity', id: '', name: '' }
                  : { type: 'string', id: triple.value.id, value: '' }),
              },
            }),
            triple
          );
        });
      }
      case 'REMOVE_ENTITY': {
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
      case 'ADD_ENTITY_VALUE': {
        const { triplesByAttributeId, attribute, linkedEntity, entityName } = event.payload;

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
      case 'CREATE_STRING_TRIPLE_FROM_PLACEHOLDER': {
        const { value, triple } = event.payload;

        return create(
          Triple.withId({
            space: context.spaceId,
            entityId: context.entityId,
            entityName: triple.entityName,
            attributeId: triple.attributeId,
            attributeName: triple.attributeName,
            value: {
              type: 'string',
              id: triple.value.id,
              value: value,
            },
          })
        );
      }

      case 'CREATE_ENTITY_TRIPLE_FROM_PLACEHOLDER': {
        const { entityId, entityName, triple } = event.payload;

        return create(
          Triple.withId({
            space: context.spaceId,
            entityId: context.entityId,
            entityName: triple.entityName,
            attributeId: triple.attributeId,
            attributeName: triple.attributeName,
            value: {
              type: 'entity',
              id: entityId,
              name: entityName,
            },
          })
        );
      }

      case 'CREATE_COLUMN_FROM_ENTITY_TABLE': {
        const { typeEntityId } = event.payload;

        const newAttributeTriple = Triple.withId({
          space: context.spaceId,
          entityId: context.entityId,
          attributeId: SYSTEM_IDS.TYPES,
          attributeName: 'Type',
          entityName: '',
          value: {
            id: SYSTEM_IDS.ATTRIBUTE,
            type: 'entity',
            name: '',
          },
        });

        const linkTypeToAttributeTriple = Triple.withId({
          space: context.spaceId,
          entityId: context.entityId,
          entityName: '',
          attributeId: SYSTEM_IDS.ATTRIBUTES,
          attributeName: 'Attributes',
          value: {
            type: 'entity',
            id: entityId,
            name: entityName,
          },
        });
      }

      case 'UPDATE_VALUE': {
        const { value, triple } = event.payload;

        if (triple.attributeId === SYSTEM_IDS.NAME) {
          return update(
            {
              ...triple,
              entityName: value,
              value: { ...triple.value, type: 'string', value },
            },
            triple
          );
        }

        update(
          {
            ...triple,
            value: { ...triple.value, type: 'string', value },
          },
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
