'use client';

import { Atom } from '@xstate/store';

import { ReactNode, createContext, useContext } from 'react';

import { queryClient } from '../query-client';
import { Relation, Value } from '../v2.types';
import { SyncEngine } from './engine';
import { GeoStore, reactiveRelations, reactiveValues } from './store';
import { GeoEventStream } from './stream';

const SyncEngineContext = createContext<{
  stream: GeoEventStream;
  store: GeoStore;
  hydrate: (entityIds?: string[]) => void;
  values: Atom<Value[]>;
  relations: Atom<Relation[]>;
} | null>(null);

export function useSyncEngine() {
  const store = useContext(SyncEngineContext);
  if (!store) {
    throw new Error('useSyncEngine must be used within a SyncEngineProvider');
  }
  return store;
}

export const stream = new GeoEventStream();
export const store = new GeoStore(stream);
export const engine = new SyncEngine(stream, queryClient, store);

export function SyncEngineProvider({ children }: { children: ReactNode }) {
  const hydrate = (entityIds?: string[]) => {
    if (!entityIds || entityIds.length === 0) {
      return;
    }

    stream.emit({ type: 'hydrate', entities: entityIds });
  };

  return (
    <SyncEngineContext.Provider
      value={{ store, stream, hydrate, values: reactiveValues, relations: reactiveRelations }}
    >
      {children}
    </SyncEngineContext.Provider>
  );
}
