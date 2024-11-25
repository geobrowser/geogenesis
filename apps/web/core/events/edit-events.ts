'use client';

import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { useMemo } from 'react';

import {
  OmitStrict,
  RenderableEntityType,
  RenderableProperty,
  TripleRenderableProperty,
  Triple as TripleType,
  Value,
} from '~/core/types';

import { StoreRelation } from '../database/types';
import { removeRelation, upsertRelation, useWriteOps } from '../database/write';
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
        typeOfId: string;
        typeOfName: string | null;

        // These properties can be optionally passed. e.g., we're inserting
        // a block in between other blocks, or we'll creating an image relation.
        renderableType?: RenderableEntityType;
        index?: string;
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
        const { toEntityId, toEntityName, fromEntityId, typeOfId, typeOfName, renderableType, index } = event.payload;

        const newRelation: StoreRelation = {
          index: index ?? INITIAL_COLLECTION_ITEM_INDEX_VALUE,
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
            value: toEntityId, // @TODO(relations): Add support for writing images
          },
        };

        return upsertRelation({ spaceId: context.spaceId, relation: newRelation });
      }

      case 'UPSERT_ATTRIBUTE': {
        const { renderable, attributeId, attributeName } = event.payload;

        // When we change the attribute for a renderable we actually change
        // the id. We delete the previous renderable here so we don't still
        // render the old renderable.
        remove(renderable, context.spaceId);

        if (renderable.type === 'RELATION') {
          return upsert(
            {
              entityId: renderable.relationId,
              entityName: null,
              attributeId: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
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
          return removeRelation({ relationId: EntityId(renderable.relationId), spaceId: context.spaceId });
        }

        if (type === 'RELATION') {
          // Delete the previous triple and create a new relation entity
          remove(renderable, context.spaceId);

          const newRelation: StoreRelation = {
            index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
            typeOf: {
              id: EntityId(renderable.attributeId),
              name: renderable.attributeName,
            },
            fromEntity: {
              id: EntityId(renderable.entityId),
              name: null,
            },
            toEntity: {
              id: EntityId(''),
              name: null,
              renderableType: 'RELATION',
              value: '',
            },
          };

          return upsertRelation({ spaceId: context.spaceId, relation: newRelation });
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
          return removeRelation({ relationId: EntityId(renderable.relationId), spaceId: context.spaceId });
        }

        return remove(
          {
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
            attributeId: SYSTEM_IDS.NAME,
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
