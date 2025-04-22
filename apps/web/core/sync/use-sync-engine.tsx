'use client';

import { ReactNode, createContext, useContext } from 'react';

import { queryClient } from '../query-client';
import { SyncEngine } from './engine';
import { EntityQuery } from './experimental_query-layer';
import { GeoStore } from './store';
import { GeoEventStream } from './stream';

const SyncEngineContext = createContext<{
  stream: GeoEventStream;
  store: GeoStore;
  query: EntityQuery;
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
const query = new EntityQuery(store);
export const engine = new SyncEngine(stream, queryClient, store);

export function SyncEngineProvider({ children }: { children: ReactNode }) {
  return <SyncEngineContext.Provider value={{ store, stream, query }}>{children}</SyncEngineContext.Provider>;
}
