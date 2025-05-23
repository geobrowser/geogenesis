'use client';

import { GraphUrl, SystemIds } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';

import { useMemo } from 'react';

import {
  BaseRelationRenderableProperty,
  ImageRelationRenderableProperty,
  OmitStrict,
  RenderableEntityType,
  RenderableProperty,
  TripleRenderableProperty,
  Triple as TripleType,
  Value,
} from '~/core/types';

import { StoreRelation } from '../database/types';
import { remove, removeRelation, upsert, upsertMany, upsertRelation, useWriteOps } from '../database/write';
import { EntityId } from '../io/schema';

export type EditEvent =
  | {
      type: 'UPSERT_RENDERABLE_TRIPLE_VALUE';
      payload: {
        renderable: TripleRenderableProperty;
        value: Value;
      };
    }
  | {
      type: 'UPSERT_ATTRIBUTE';
      payload: {
        renderable: RenderableProperty;
        attributeId: string;
        attributeName: string | null;
      };
    }
  | {
      type: 'CHANGE_RENDERABLE_TYPE';
      payload: {
        renderable: RenderableProperty;
        type: RenderableProperty['type'];
      };
    }
  | {
      type: 'DELETE_RENDERABLE';
      payload: {
        renderable: RenderableProperty;
      };
    }
  | {
      type: 'UPSERT_RELATION';
      payload: {
        toEntityId: string;
        toEntityName: string | null;
        fromEntityId: string;
        fromEntityName: string | null;
        typeOfId: string;
        typeOfName: string | null;

        // These properties can be optionally passed. e.g., we're inserting
        // a block in between other blocks, or we'll creating an image relation.
        renderableType?: RenderableEntityType;
        index?: string;
        value?: string;
      };
    }
  | {
      type: 'DELETE_RELATION';
      payload: {
        renderable: BaseRelationRenderableProperty | ImageRelationRenderableProperty;
      };
    }

  // EVERYTHING BELOW THIS IS A LEGACY EVENT THAT WILL GET REMOVED
  | {
      type: 'EDIT_ENTITY_NAME';
      payload: {
        name: string;
      };
    }
  | {
      type: 'DELETE_ENTITY';
      payload: {
        triple: TripleType;
      };
    };

interface EditApi {
  upsertMany: ReturnType<typeof useWriteOps>['upsertMany'];
  upsert: ReturnType<typeof useWriteOps>['upsert'];
  remove: ReturnType<typeof useWriteOps>['remove'];
}

export interface EditEventContext {
  spaceId: string;
  entityId: string;
  entityName: string | null;
}

interface ListenerConfig {
  api: EditApi;
  context: EditEventContext;
}

const listener =
  ({ api: { upsert, remove }, context }: ListenerConfig) =>
  (event: EditEvent) => {
    switch (event.type) {
      case 'UPSERT_RENDERABLE_TRIPLE_VALUE': {
        const { value, renderable } = event.payload;

        return upsert(
          {
            ...renderable,
            value,
          },
          context.spaceId
        );
      }

      case 'UPSERT_RELATION': {
        const { toEntityId, toEntityName, fromEntityId, typeOfId, typeOfName, renderableType, index, value } =
          event.payload;
        const { spaceId } = context;

        const newRelation: StoreRelation = {
          space: spaceId,
          index: index ?? INITIAL_RELATION_INDEX_VALUE,
          typeOf: {
            id: EntityId(typeOfId),
            name: typeOfName,
          },
          fromEntity: {
            id: EntityId(fromEntityId),
            name: null,
          },
          toEntity: {
            id: EntityId(toEntityId),
            name: toEntityName,
            renderableType: renderableType ?? 'RELATION',
            value: value ?? toEntityId,
          },
        };

        return upsertRelation({ spaceId: context.spaceId, relation: newRelation });
      }

      case 'UPSERT_ATTRIBUTE': {
        const { renderable, attributeId, attributeName } = event.payload;

        // When we change the attribute for a renderable we actually change
        // the id. We delete the previous renderable here so we don't still
        // render the old renderable.
        remove(
          {
            attributeId: renderable.attributeId,
            attributeName: renderable.attributeName,
            entityId: renderable.entityId,
          },
          context.spaceId
        );

        if (renderable.type === 'RELATION') {
          return upsert(
            {
              entityId: renderable.relationId,
              entityName: null,
              attributeId: SystemIds.RELATION_TYPE_ATTRIBUTE,
              attributeName: 'Relation type',
              // Relations are the only entity in the system that we expect
              // to use an entity value type in a triple
              value: {
                type: 'URL',
                value: GraphUrl.fromEntityId(attributeId),
              },
            },
            context.spaceId
          );
        }

        // @TODO(relations): Add support for IMAGE
        if (renderable.type === 'IMAGE') {
          return;
        }

        return upsert(
          {
            ...renderable,
            attributeId,
            attributeName,
            value: {
              type: renderable.type,
              value: renderable.value,
            },
          },
          context.spaceId
        );
      }

      case 'CHANGE_RENDERABLE_TYPE': {
        const { renderable, type } = event.payload;

        // If we're changing from a relation then we need to delete all of the triples
        // on the relation.
        if (renderable.type === 'RELATION' || renderable.type === 'IMAGE') {
          return removeRelation({
            relation: {
              id: EntityId(renderable.relationId),
              space: context.spaceId,
              index: INITIAL_RELATION_INDEX_VALUE,
              typeOf: {
                id: EntityId(renderable.attributeId),
                name: renderable.attributeName,
              },
              fromEntity: {
                id: EntityId(renderable.entityId),
                name: renderable.entityName,
              },
              toEntity: {
                id: EntityId(renderable.value),
                name: renderable.valueName,
                renderableType: 'RELATION',
                value: renderable.value,
              },
            },
            spaceId: context.spaceId,
          });
        }

        if (type === 'RELATION') {
          // Delete the previous triple and create a new relation entity
          return removeRelation({
            relation: {
              id: EntityId(renderable.entityId),
              space: context.spaceId,
              index: INITIAL_RELATION_INDEX_VALUE,
              typeOf: {
                id: EntityId(renderable.attributeId),
                name: renderable.attributeName,
              },
              fromEntity: {
                id: EntityId(renderable.entityId),
                name: renderable.entityName,
              },
              toEntity: {
                id: EntityId(renderable.value),
                name: null,
                renderableType: 'RELATION',
                value: renderable.value,
              },
            },
            spaceId: context.spaceId,
          });
        }

        // @TODO(relations): Add support for IMAGE
        if (type === 'IMAGE') {
          return;
        }

        return upsert(
          {
            ...renderable,
            value: {
              type,
              value: '',
            },
          },
          context.spaceId
        );
      }

      case 'DELETE_RENDERABLE': {
        const { renderable } = event.payload;

        if (renderable.type === 'RELATION' || renderable.type === 'IMAGE') {
          return removeRelation({
            relation: {
              id: EntityId(renderable.relationId),
              space: context.spaceId,
              index: INITIAL_RELATION_INDEX_VALUE,
              typeOf: {
                id: EntityId(renderable.attributeId),
                name: renderable.attributeName,
              },
              fromEntity: {
                id: EntityId(renderable.entityId),
                name: renderable.entityName,
              },
              toEntity: {
                id: EntityId(renderable.value),
                name: renderable.valueName,
                renderableType: 'RELATION',
                value: renderable.value,
              },
            },
            spaceId: context.spaceId,
          });
        }

        return remove(
          {
            attributeName: renderable.attributeName,
            attributeId: renderable.attributeId,
            entityId: context.entityId,
          },
          context.spaceId
        );
      }

      // ALL OF THE BELOW EVENTS ARE LEGACY AND WILL GET REMOVED

      case 'EDIT_ENTITY_NAME': {
        const { name } = event.payload;

        return upsert(
          {
            entityId: context.entityId,
            entityName: name,
            attributeId: SystemIds.NAME_ATTRIBUTE,
            attributeName: 'Name',
            value: { type: 'TEXT', value: name },
          },
          context.spaceId
        );
      }

      // @TODO: Do we need both of these delete events?
      case 'DELETE_ENTITY': {
        const { triple } = event.payload;
        return remove(triple, context.spaceId);
      }

      case 'DELETE_RELATION': {
        const { renderable } = event.payload;

        return removeRelation({
          relation: {
            id: EntityId(renderable.relationId),
            space: context.spaceId,
            index: INITIAL_RELATION_INDEX_VALUE,
            typeOf: {
              id: EntityId(renderable.attributeId),
              name: renderable.attributeName,
            },
            fromEntity: {
              id: EntityId(renderable.entityId),
              name: renderable.entityName,
            },
            toEntity: {
              id: EntityId(renderable.value),
              name: renderable.valueName,
              renderableType: 'RELATION',
              value: renderable.value,
            },
          },
          spaceId: context.spaceId,
        });
      }
    }
  };

export function useEditEvents(config: OmitStrict<ListenerConfig, 'api'>) {
  const { upsert, remove, upsertMany } = useWriteOps();

  const send = useMemo(() => {
    return listener({
      ...config,
      api: {
        upsert,
        remove,
        upsertMany,
      },
    });
  }, [config, remove, upsert, upsertMany]);

  return send;
}

export function editEvent(config: OmitStrict<ListenerConfig, 'api'>) {
  return listener({
    ...config,
    api: {
      upsert: upsert,
      remove: remove,
      upsertMany: upsertMany,
    },
  });
}
