import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { ObservableComputed, computed, observable, observe } from '@legendapp/state';
import { ActionsStore, useActionsStoreContext } from '../../action';
import { Entity as IEntity, Triple as ITriple } from '../../types';
import { makeOptionalComputed } from '../../utils';
import { pipe } from '@mobily/ts-belt';
import { Triple } from '../../triple';
import { Entity } from '../../entity';

export class LocalStore {
  store: ActionsStore;
  triples$: ObservableComputed<ITriple[]> = observable([]);
  entities$: ObservableComputed<IEntity[]> = observable([]);

  constructor({ store }: { store: ActionsStore }) {
    this.store = store;

    this.triples$ = makeOptionalComputed(
      [],
      computed(() => {
        const allActions = this.store.allActions$.get();
        const triples = Triple.fromActions(allActions, []);
        return Triple.withLocalNames(allActions, triples);
      })
    );

    this.entities$ = makeOptionalComputed(
      [],
      computed(() => {
        return pipe(this.triples$.get(), triples => Entity.entitiesFromTriples(triples));
      })
    );

    observe(() => {
      const entities = this.entities$.get();
      const triples = this.triples$.get();

      console.log('entities', entities);
      console.log('triples', triples);
    });
  }
}

const LocalStoreContext = createContext<LocalStore | undefined>(undefined);

interface Props {
  children: React.ReactNode;
}

export function LocalStoreProvider({ children }: Props) {
  const ActionsStore = useActionsStoreContext();

  const store = useMemo(() => {
    return new LocalStore({ store: ActionsStore });
  }, [ActionsStore]);

  return <LocalStoreContext.Provider value={store}>{children}</LocalStoreContext.Provider>;
}

export function useGeoStoreContext() {
  const value = useContext(LocalStoreContext);

  if (!value) {
    throw new Error(`Missing ActionsStoreProvider`);
  }

  return value;
}
