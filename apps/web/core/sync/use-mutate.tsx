import { SystemIds } from '@graphprotocol/grc-20';
import produce, { Draft } from 'immer';

import { remove, removeRelation, upsert, upsertRelation } from '../database/write';
import { ID } from '../id';
import { OmitStrict } from '../types';
import { NativeRenderableProperty, Relation, RelationRenderableProperty, Value } from '../v2.types';
import { GeoStore } from './store';
import { store, useSyncEngine } from './use-sync-engine';

type Recipe<T> = (draft: Draft<T>) => void | T | undefined;
type GeoProduceFn<T> = (base: T, recipe: Recipe<T>) => void;

/**
 * The Mutator interface defines common patterns for updating data
 * in the app's local stores. Currently we have three common data models
 * that change:
 * 1. Values
 * 2. Relations
 * 3. Renderables – A unified representation of a Value OR a Relation
 * 4. @TODO: Properties
 *
 * The Mutator API abstracts complexity for writing to stores directly
 * by orchestrating writes to the appropriate stores based on the type
 * of data model being changed. The stores handle internal state, syncing,
 * persistence, and other effects behind-the-scenes, and update any
 * components subscribed to store state.
 */
export interface Mutator {
  entities: {
    name: {
      set: (entityId: string, spaceId: string, value: string) => void;
    };
  };
  values: {
    get: (id: string, entityId: string) => Value | null;
    set: (value: OmitStrict<Value, 'id'>) => void;
    update: GeoProduceFn<Value>;
    delete: (value: Value) => void;
  };
  relations: {
    get: (id: string, entityId: string) => Relation | null;
    set: (relation: Relation) => void;
    update: GeoProduceFn<Relation>;
    delete: (relation: Relation) => void;
  };
  /**
   * When mutating renderables in the app, you should go through the
   * renderables namespace. This makes it simpler to continue using
   * the renderable data without having to map to values or relations
   * in the caller's code.
   *
   * Instead, just pass the renderable you want to create, update, or
   * delete. This namespace automatically converts to either a Value or
   * Relation depending on whether you used renderables.values or
   * renderables.relations.
   */
  renderables: {
    values: {
      set: (renderable: NativeRenderableProperty) => void;
      update: (renderable: NativeRenderableProperty, draft: Recipe<Value>) => void;
      delete: (renderable: NativeRenderableProperty) => void;
    };
    relations: {
      set: (renderable: RelationRenderableProperty) => void;
      update: (renderable: RelationRenderableProperty, draft: Recipe<Relation>) => void;
      delete: (renderable: RelationRenderableProperty) => void;
    };
  };
}

function createMutator(store: GeoStore): Mutator {
  return {
    entities: {
      name: {
        set: (entityId, spaceId, value) => {
          const newValue: Value = {
            id: ID.createValueId({
              entityId: entityId,
              propertyId: SystemIds.NAME_PROPERTY,
              spaceId,
            }),
            entity: {
              id: entityId,
              name: value,
            },
            property: {
              id: SystemIds.NAME_PROPERTY,
              name: 'Name',
              dataType: 'TEXT',
              renderableType: 'TEXT',
            },
            spaceId,
            value,
          };

          store.setValue(newValue);
          // Currently we have two stores, the new sync store and the
          // legacy jotai events store. For now we interop between both,
          // but eventually we should migrate completely to the sync store.
          upsert(newValue);
        },
      },
    },
    values: {
      get: (id, entityId) => store.getValue(id, entityId),
      set: newValue => {
        const id = ID.createValueId({
          entityId: newValue.entity.id,
          propertyId: newValue.property.id,
          spaceId: newValue.spaceId,
        });

        const next: Value = {
          ...newValue,
          id,
        };

        store.setValue(next);

        // Currently we have two stores, the new sync store and the
        // legacy jotai events store. For now we interop between both,
        // but eventually we should migrate completely to the sync store.
        upsert(next);
      },
      update: (base, recipe) => {
        const newValue = produce(base, recipe);
        store.setValue(newValue);

        // Currently we have two stores, the new sync store and the
        // legacy jotai events store. For now we interop between both,
        // but eventually we should migrate completely to the sync store.
        upsert(newValue);
      },
      delete: newValue => {
        store.deleteValue(newValue);

        // Currently we have two stores, the new sync store and the
        // legacy jotai events store. For now we interop between both,
        // but eventually we should migrate completely to the sync store.
        remove(newValue);
      },
    },
    relations: {
      get: (id, entityId) => store.getRelation(id, entityId),
      set: newRelation => {
        store.setRelation(newRelation);

        // Currently we have two stores, the new sync store and the
        // legacy jotai events store. For now we interop between both,
        // but eventually we should migrate completely to the sync store.
        upsertRelation({ relation: newRelation });
      },
      update: (base, recipe) => {
        const newRelation = produce(base, recipe);
        store.setRelation(newRelation);

        // Currently we have two stores, the new sync store and the
        // legacy jotai events store. For now we interop between both,
        // but eventually we should migrate completely to the sync store.
        upsertRelation({ relation: newRelation });
      },
      delete: newRelation => {
        store.deleteRelation(newRelation);

        // Currently we have two stores, the new sync store and the
        // legacy jotai events store. For now we interop between both,
        // but eventually we should migrate completely to the sync store.
        removeRelation({ relation: newRelation });
      },
    },
    renderables: {
      values: {
        set: renderable => {
          const valueFromRenderable = getValueFromRenderable(renderable);
          store.setValue(valueFromRenderable);

          // Currently we have two stores, the new sync store and the
          // legacy jotai events store. For now we interop between both,
          // but eventually we should migrate completely to the sync store.
          upsert(valueFromRenderable);
        },
        update: (renderable, draft) => {
          const valueFromRenderable = getValueFromRenderable(renderable);
          const newRenderable = produce(valueFromRenderable, draft);
          store.setValue(newRenderable);

          // Currently we have two stores, the new sync store and the
          // legacy jotai events store. For now we interop between both,
          // but eventually we should migrate completely to the sync store.
          upsert(valueFromRenderable);
        },
        delete: renderable => {
          const valueFromRenderable = getValueFromRenderable(renderable);
          store.deleteValue(valueFromRenderable);
          remove(valueFromRenderable);
        },
      },
      relations: {
        set: renderable => {
          const relation = getRelationFromRenderable(renderable);
          store.setRelation(relation);

          // Currently we have two stores, the new sync store and the
          // legacy jotai events store. For now we interop between both,
          // but eventually we should migrate completely to the sync store.
          upsertRelation({ relation });
        },
        update: (renderable, draft) => {
          const relation = getRelationFromRenderable(renderable);
          const newRenderable = produce(relation, draft);
          store.setRelation(newRenderable);

          // Currently we have two stores, the new sync store and the
          // legacy jotai events store. For now we interop between both,
          // but eventually we should migrate completely to the sync store.
          upsertRelation({ relation });
        },
        delete: renderable => {
          const relation = getRelationFromRenderable(renderable);
          store.deleteRelation(relation);
          removeRelation({ relation });
        },
      },
    },
  };
}

export const storage: Mutator = createMutator(store);

export function useMutate() {
  const { store } = useSyncEngine();

  return {
    storage: createMutator(store),
  };
}

function getValueFromRenderable(renderable: NativeRenderableProperty): Value {
  return {
    id: ID.createValueId({
      entityId: renderable.entityId,
      propertyId: renderable.propertyId,
      spaceId: renderable.spaceId,
    }),
    spaceId: renderable.spaceId,
    entity: {
      id: renderable.entityId,
      name: renderable.entityName,
    },
    property: {
      id: renderable.propertyId,
      name: renderable.propertyName,
      dataType: renderable.type,
      renderableType: renderable.type,
    },
    value: renderable.value,
    options: renderable.options,
  };
}

function getRelationFromRenderable(renderable: RelationRenderableProperty): Relation {
  return {
    id: renderable.relationId,
    entityId: renderable.relationEntityId,
    position: renderable.position,
    verified: renderable.verified,
    renderableType: renderable.type,
    spaceId: renderable.spaceId,
    fromEntity: {
      id: renderable.fromEntityId,
      name: renderable.fromEntityName,
    },
    type: {
      id: renderable.propertyId,
      name: renderable.propertyName,
    },
    toEntity: {
      id: renderable.value, // is this right?
      name: renderable.valueName,
      value: renderable.value,
    },
  };
}
