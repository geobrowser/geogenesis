import produce, { Draft } from 'immer';

import { Relation, Value } from '../v2.types';
import { useSyncEngine } from './use-sync-engine';

type GeoProduceFn<T> = (base: T, recipe: (draft: Draft<T>) => void | T | undefined) => void;

interface Mutation {
  values: {
    set: (value: Value) => void;
    update: GeoProduceFn<Value>;
    delete: (value: Value) => void;
  };
  relations: {
    set: (relation: Relation) => void;
    update: GeoProduceFn<Relation>;
    delete: (relation: Relation) => void;
  };
}

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
  const api: Mutation = {
    values: {
      set: store.setValue,
      update: (base, recipe) => {
        const newValue = produce(base, recipe);
        // @TODO: Can upsert
        store.setValue(newValue);
      },
      delete: store.deleteValue,
    },
    relations: {
      set: store.setRelation,
      update: (base, recipe) => {
        const newValue = produce(base, recipe);
        store.setRelation(newValue);
      },
      delete: store.deleteRelation,
    },
    // properties: {
    //   set: () => {},
    //   delete: () => {},
    // },
    // types: {
    //   set: () => {},
    //   delete: () => {},
    // },
  };

  return {
    tx: (fn: (store: typeof api) => void) => {
      fn(api);
    },
  };
}

function Example() {
  const { store } = useSyncEngine();
  const { tx } = useMutate();

  tx(db => {
    /**
     * Option 1: Explicit set/delete
     *
     * The events get called by the set + delete.
     *
     * Downside is that you always need the entire struct
     * in order to write. Modifying an existing struct may
     * be more cumbersome.
     */
    db.relations.set(newRelation);
    db.values.delete(value);

    /**
     * Option 2: Draft-based mutations
     *
     * Benefit is that you can granularly change any struct without
     * requiring the entire struct at the callsite.
     *
     * We would need a mechanism to send the sync events
     * whenever data changes.
     *
     * The relation also may not exist in the store if it's not already
     * hydrated or it's a brand new relation. How would that work?
     *
     * Using save() within the function might break the order of sync
     * since we need to have the sync event fire _after_ the state is
     * updated locally.
     */
    const relation = db.relations.get('relation id');

    relation.verified = true;
    db.relations.save([relation.id]); // this could send the event

    const value = db.values.get('id');
    value.value = 'banana';
    db.values.save([value.id]);

    /**
     * Option 3: Combination of both
     *
     * You still need the old version of a value, but you don't have to
     * spread properties as much and can do deeply nested things.
     */
    const entity = store.getEntity('id');

    // How do we know when we're creating a new value vs updating
    // an existing value
    db.values.set(entity!.values[0]);
    // Updating an existing value
    db.values.update(entity!.values[0], draft => {
      draft.value = 'banana';
    });
    db.values.delete(entity!.values[0]);

    db.relations.set(entity!.relations[0]);
    db.relations.update(entity!.relations[0], draft => {
      draft.verified = true;
      draft.toEntity.value = 'banana';
    });
  });

  return null;
}
