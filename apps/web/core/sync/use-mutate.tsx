import produce, { Draft } from 'immer';

import { remove, removeRelation, upsert, upsertRelation } from '../database/write';
import { ID } from '../id';
import { NativeRenderableProperty, Relation, RelationRenderableProperty, Value } from '../v2.types';
import { store, useSyncEngine } from './use-sync-engine';

type Recipe<T> = (draft: Draft<T>) => void | T | undefined;
type GeoProduceFn<T> = (base: T, recipe: Recipe<T>) => void;

export interface Mutator {
  values: {
    get: (id: string, entityId: string) => Value | null;
    set: (value: Value) => void;
    update: GeoProduceFn<Value>;
    delete: (value: Value) => void;
  };
  relations: {
    get: (id: string, entityId: string) => Relation | null;
    set: (relation: Relation) => void;
    update: GeoProduceFn<Relation>;
    delete: (relation: Relation) => void;
  };
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

export const storage: Mutator = {
  values: {
    get: (id, entityId) => store.getValue(id, entityId),
    set: newValue => {
      store.setValue(newValue);

      // Currently we have two stores, the new sync store and the
      // legacy jotai events store. For now we interop between both,
      // but eventually we should migrate completely to the sync store.
      upsert(newValue);
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

export function useMutate() {
  const { store } = useSyncEngine();

  // @TODO: Should this API be immer-y? Where we can provide a set of new
  // values to be written to the GeoStore? Would that matter? e.g., I want
  // to just change the value of a Value I could just do value.value = X
  // instead of having to set the entire Value.
  //
  // Might especially be ergonomic for relations, actually. Can also have
  // an Entities-based model which might feel better than values + relations.
  //
  // Main thing we'd still need is to be able to dispatch an event whenever
  // anything in a tx changed so we can manage syncing + downstream effects.
  const api: Mutator = {
    values: {
      get: (id, entityId) => store.getValue(id, entityId),
      set: newValue => {
        store.setValue(newValue);

        // Currently we have two stores, the new sync store and the
        // legacy jotai events store. For now we interop between both,
        // but eventually we should migrate completely to the sync store.
        upsert(newValue);
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

  return {
    storage: api,
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
