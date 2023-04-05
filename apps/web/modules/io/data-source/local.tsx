import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { ObservableComputed, computed, observable } from '@legendapp/state';
import { ActionsStore, useActionsStoreContext } from '../../action';
import { Entity as IEntity, Triple as ITriple } from '../../types';
import { makeOptionalComputed } from '../../utils';
import { pipe } from '@mobily/ts-belt';
import { Triple } from '../../triple';
import { Entity } from '../../entity';
import { useSelector } from '@legendapp/state/react';

export class LocalStore {
  private store: ActionsStore;
  triples$: ObservableComputed<ITriple[]> = observable([]);
  entities$: ObservableComputed<IEntity[]> = observable([]);
  spaces$: ObservableComputed<string[]> = observable<string[]>([]);

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

    this.spaces$ = makeOptionalComputed(
      [],
      computed(() => {
        const allSpaces = this.triples$.get().map(t => t.space);
        return [...new Set(allSpaces)];
      })
    );
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

export function useLocalStoreContext() {
  const value = useContext(LocalStoreContext);

  if (!value) {
    throw new Error(`Missing ActionsStoreProvider`);
  }

  return value;
}

export function useLocalStore() {
  const { entities$, triples$, spaces$ } = useLocalStoreContext();

  const entities = useSelector(entities$);
  const triples = useSelector(triples$);
  const spaces = useSelector(spaces$);

  return {
    entities,
    triples,
    spaces,
  };
}
