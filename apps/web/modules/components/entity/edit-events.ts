import { A, D, F, N, O, pipe } from '@mobily/ts-belt';
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
        triples: readonly TripleType[];
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
        triplesByAttributeId: Record<string, readonly TripleType[]>;
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
        triplesByAttributeId: Record<string, readonly TripleType[]>;
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
              attributeId: 'name',
              attributeName: 'Name',
              value: { id: ID.createValueId(), type: 'string', value: name },
            })
          );
        }

        return update(
          Triple.ensureStableId({
            ...triple,
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
              attributeId: 'Description',
              attributeName: 'Description',
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
        return create(Triple.empty(context.spaceId, context.entityId));
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
          // When we remove the last linked entity, we just want to set the value to empty
          // instead of completely deleting the last triple.
          if (isLastEntity) {
            return update(
              Triple.ensureStableId({
                ...triple,
                value: { ...triple.value, type: 'entity', id: '' },
              }),
              triple
            );
          }
        }

        return remove(triple);
      }
      case 'LINK_ATTRIBUTE': {
        const { newAttribute, oldAttribute, triplesByAttributeId } = event.payload;
        const triplesToUpdate = triplesByAttributeId[oldAttribute.id];

        const hasTriplesAtNewAttributeId = pipe(
          triplesByAttributeId,
          O.fromNullable,
          O.match(
            triplesById =>
              pipe(
                triplesById,
                D.get(newAttribute.id),
                O.map(triples => triples.length > 0)
              ),
            () => false
          )
        );

        // If triples at the new id already exists we want the user to use the existing entry method
        if (hasTriplesAtNewAttributeId) {
          return;
        }

        const hasTriplesToUpdate = pipe(
          triplesToUpdate,
          O.fromNullable,
          O.map(triples => triples.length > 0),
          O.getWithDefault(false)
        );

        if (hasTriplesToUpdate) {
          triplesToUpdate?.forEach(triple => {
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

        const triplesAtAttributeId = D.get(triplesByAttributeId, attribute.id);
        const hasSingleTripleAtAttributeId = pipe(
          triplesAtAttributeId,
          O.match(
            triples => triples.length === 1,
            () => false
          )
        );

        const firstValueAtAttributeId = pipe(
          triplesAtAttributeId,
          O.match(
            triples => A.get(triples as TripleType[], 0),
            () => undefined
          )
        );

        // There may be a single "empty" triple in the relation value. If this empty triple exists we want to update it
        // instead of creating a new triple.
        if (
          hasSingleTripleAtAttributeId &&
          firstValueAtAttributeId?.value.type === 'entity' &&
          !firstValueAtAttributeId?.value.id
        ) {
          return update(
            Triple.ensureStableId({
              ...firstValueAtAttributeId,
              value: {
                ...firstValueAtAttributeId.value,
                type: 'entity',
                id: linkedEntity.id,
                name: linkedEntity.name,
              },
              attributeName: firstValueAtAttributeId.attributeName,
            }),
            firstValueAtAttributeId
          );
        }

        // If there's no empty value then we should create a new one.
        return create(
          Triple.withId({
            space: context.spaceId,
            entityId: context.entityId,
            entityName: entityName,
            attributeId: attribute.id,
            attributeName: triplesByAttributeId[attribute.id]?.[0]?.attributeName ?? '',
            value: {
              type: 'entity',
              id: linkedEntity.id,
              name: linkedEntity.name,
            },
          })
        );
      }
      case 'UPDATE_VALUE': {
        const { value, triple } = event.payload;
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
