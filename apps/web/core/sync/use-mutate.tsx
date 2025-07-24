import { SystemIds } from '@graphprotocol/grc-20';
import produce, { Draft } from 'immer';

import { DATA_TYPE_PROPERTY } from '../constants';
import { ID } from '../id';
import { OmitStrict } from '../types';
import { DataType, Relation, Value } from '../v2.types';
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
 * 4. Properties – Property entities with dataType
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
  properties: {
    create: (params: { entityId: string; spaceId: string; name: string; dataType: DataType }) => void;
  };
  values: {
    get: (id: string, entityId: string) => Value | null;
    set: (value: OmitStrict<Value, 'id'> & { id?: string }) => void;
    update: GeoProduceFn<Value>;
    delete: (value: Value) => void;
  };
  relations: {
    get: (id: string, entityId: string) => Relation | null;
    set: (relation: Relation) => void;
    update: GeoProduceFn<Relation>;
    delete: (relation: Relation) => void;
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
        },
      },
    },
    properties: {
      create: ({ entityId, spaceId, name, dataType }) => {
        // Set the name value
        const nameValue: Value = {
          id: ID.createValueId({
            entityId,
            propertyId: SystemIds.NAME_PROPERTY,
            spaceId,
          }),
          entity: {
            id: entityId,
            name,
          },
          property: {
            id: SystemIds.NAME_PROPERTY,
            name: 'Name',
            dataType: 'TEXT',
            renderableType: null,
          },
          spaceId,
          value: name,
        };

        // Set the dataType value
        const dataTypeValue: Value = {
          id: ID.createValueId({
            entityId,
            propertyId: DATA_TYPE_PROPERTY,
            spaceId,
          }),
          entity: {
            id: entityId,
            name,
          },
          property: {
            id: DATA_TYPE_PROPERTY,
            name: 'Data Type',
            dataType: dataType,
            renderableType: null,
          },
          spaceId,
          value: dataType,
        };

        store.setValue(nameValue);
        store.setValue(dataTypeValue);
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
      },
      update: (base, recipe) => {
        const newValue = produce(base, recipe);
        store.setValue(newValue);
      },
      delete: newValue => {
        store.deleteValue(newValue);
      },
    },
    relations: {
      get: (id, entityId) => store.getRelation(id, entityId),
      set: newRelation => {
        store.setRelation(newRelation);
      },
      update: (base, recipe) => {
        const newRelation = produce(base, recipe);
        store.setRelation(newRelation);
      },
      delete: newRelation => {
        store.deleteRelation(newRelation);
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
