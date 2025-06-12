'use client';

import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';

import { useMemo } from 'react';

import { OmitStrict } from '~/core/types';

import { ID } from '../id';
import { Mutator, storage, useMutate } from '../sync/use-mutate';
import {
  BaseRelationRenderableProperty,
  ImageRelationRenderableProperty,
  Relation,
  RenderableEntityType,
  RenderableProperty,
  Value,
  ValueRenderableProperty,
} from '../v2.types';

export type EditEvent =
  | {
      type: 'UPSERT_RENDERABLE_TRIPLE_VALUE';
      payload: {
        renderable: ValueRenderableProperty;
        value: {
          value: Value['value'];
          options?: Value['options'];
        };
      };
    }
  | {
      type: 'UPSERT_ATTRIBUTE';
      payload: {
        renderable: RenderableProperty;
        propertyId: string;
        propertyName: string | null;
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
        position?: string;
        value?: string;
      };
    }
  | {
      type: 'DELETE_RELATION';
      payload: {
        renderable: BaseRelationRenderableProperty | ImageRelationRenderableProperty;
      };
    };

export interface EditEventContext {
  spaceId: string;
  entityId: string;
  entityName: string | null;
}

interface ListenerConfig {
  storage: Mutator;
  context: EditEventContext;
}

const listener =
  ({ storage, context }: ListenerConfig) =>
  (event: EditEvent) => {
    switch (event.type) {
      case 'UPSERT_RENDERABLE_TRIPLE_VALUE': {
        const { value, renderable } = event.payload;

        const newValue: Value = {
          ...renderable,
          ...value,
          entity: {
            id: renderable.entityId,
            name: renderable.entityName,
          },
          id: ID.createValueId({
            entityId: renderable.entityId,
            propertyId: renderable.propertyId,
            spaceId: renderable.spaceId,
          }),
          property: {
            id: renderable.propertyId,
            name: renderable.propertyName,
            dataType: renderable.type,
          },
        };

        storage.values.set(newValue);

        break;
      }

      case 'UPSERT_RELATION': {
        const { toEntityId, toEntityName, fromEntityId, typeOfId, typeOfName, renderableType, position, value } =
          event.payload;
        const { spaceId } = context;

        // @TODO(migration): Migrate to new lightweight relations
        const newRelation: Relation = {
          id: ID.createEntityId(),
          entityId: ID.createEntityId(),
          spaceId: spaceId,
          position: position ?? INITIAL_RELATION_INDEX_VALUE,
          renderableType: renderableType ?? 'RELATION',
          verified: false,
          type: {
            id: typeOfId,
            name: typeOfName,
          },
          fromEntity: {
            id: fromEntityId,
            name: null,
          },
          toEntity: {
            id: toEntityId,
            name: toEntityName,
            value: value ?? toEntityId,
          },
        };

        storage.relations.set(newRelation);

        break;
      }

      case 'UPSERT_ATTRIBUTE': {
        const { renderable, propertyId, propertyName } = event.payload;

        // When we change the attribute for a renderable we actually change
        // the id. We delete the previous renderable here so we don't still
        // render the old renderable.
        const valueId = ID.createValueId({
          entityId: renderable.entityId,
          propertyId: renderable.propertyId,
          spaceId: renderable.spaceId,
        });

        const lastValue = storage.values.get(valueId, renderable.entityId);

        if (lastValue) {
          storage.values.delete(lastValue);
        }

        if (renderable.type === 'RELATION') {
          // @TODO: Create lightweight relation
        }

        storage.values.set({
          id: valueId,
          entity: {
            id: renderable.entityId,
            name: renderable.entityName,
          },
          spaceId: renderable.spaceId,
          value: renderable.value,
          property: {
            id: propertyId,
            name: propertyName,
            dataType: 'TEXT',
            // @TODO: Other fields
          },
        });

        // @TODO(relations): Add support for IMAGE
        if (renderable.type === 'IMAGE') {
          return;
        }

        break;
      }

      case 'DELETE_RENDERABLE': {
        const { renderable } = event.payload;

        if (renderable.type === 'RELATION' || renderable.type === 'IMAGE') {
          const lastRelation = storage.relations.get(renderable.relationId, renderable.entityId);

          if (lastRelation) {
            storage.relations.delete(lastRelation);
          }

          return;
        }

        const valueId = ID.createValueId({
          entityId: renderable.entityId,
          propertyId: renderable.propertyId,
          spaceId: renderable.spaceId,
        });

        const lastValue = storage.values.get(valueId, renderable.entityId);

        if (lastValue) {
          storage.values.delete(lastValue);
        }

        break;
      }

      // ALL OF THE BELOW EVENTS ARE LEGACY AND WILL GET REMOVED

      case 'DELETE_RELATION': {
        const { renderable } = event.payload;

        const lastRelation = storage.relations.get(renderable.relationId, renderable.entityId);

        if (lastRelation) {
          storage.relations.delete(lastRelation);
        }

        return;
      }
    }
  };

export function useAction(config: OmitStrict<ListenerConfig, 'storage'>) {
  const { storage } = useMutate();

  const send = useMemo(() => {
    return listener({
      ...config,
      storage,
    });
  }, [config, storage]);

  return send;
}

export function action(config: OmitStrict<ListenerConfig, 'storage'>) {
  return listener({
    ...config,
    storage,
  });
}
