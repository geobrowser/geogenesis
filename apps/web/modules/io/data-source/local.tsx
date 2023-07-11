import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { ObservableComputed, computed, observable } from '@legendapp/state';
import { Action, ActionsStore, useActionsStoreContext } from '../../action';
import { Entity as IEntity, Triple as ITriple } from '../../types';
import { makeOptionalComputed } from '../../utils';
import { A, pipe } from '@mobily/ts-belt';
import { Triple } from '../../triple';
import { Entity } from '../../entity';
import { useSelector } from '@legendapp/state/react';

export class LocalStore {
  private store: ActionsStore;
  triples$: ObservableComputed<ITriple[]> = observable([]);
  triplesByEntityId$: ObservableComputed<Record<string, ITriple[]>> = observable<Record<string, ITriple[]>>({});
  unpublishedTriples$: ObservableComputed<ITriple[]> = observable([]);
  entities$: ObservableComputed<IEntity[]> = observable([]);
  unpublishedEntities$: ObservableComputed<IEntity[]> = observable([]);
  spaces$: ObservableComputed<string[]> = observable<string[]>([]);
  unpublishedSpaces$: ObservableComputed<string[]> = observable<string[]>([]);

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

    this.triplesByEntityId$ = makeOptionalComputed(
      {} as Record<string, ITriple[]>,
      computed(() => {
        const triples = this.triples$.get();

        return triples.reduce<Record<string, ITriple[]>>((acc, triple) => {
          if (!acc[triple.entityId]) acc[triple.entityId] = [];
          acc[triple.entityId] = acc[triple.entityId].concat(triple);
          return acc;
        }, {});
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

    this.unpublishedTriples$ = makeOptionalComputed(
      [],
      computed(() => {
        const allActions = this.store.allActions$.get();
        const unpublishedActions = Action.unpublishedChanges(allActions);
        const triples = Triple.fromActions(unpublishedActions, []);
        return Triple.withLocalNames(allActions, triples);
      })
    );

    this.unpublishedEntities$ = makeOptionalComputed(
      [],
      computed(() => {
        return pipe(this.triples$.get(), triples => Entity.entitiesFromTriples(triples));
      })
    );

    this.unpublishedSpaces$ = makeOptionalComputed(
      [],
      computed(() => {
        const allSpaces = this.unpublishedTriples$.get().map(t => t.space);
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
    throw new Error(`Missing LocalStoreProvider`);
  }

  return value;
}

export function useLocalStore() {
  const { entities$, triples$, spaces$, unpublishedEntities$, unpublishedSpaces$, unpublishedTriples$ } =
    useLocalStoreContext();

  const entities = useSelector(entities$);
  const triples = useSelector(triples$);
  const unpublishedEntities = useSelector(unpublishedEntities$);
  const unpublishedTriples = useSelector(unpublishedTriples$);
  const spaces = useSelector(spaces$);
  const unpublishedSpaces = useSelector(unpublishedSpaces$);

  return {
    entities,
    triples,
    unpublishedEntities,
    unpublishedTriples,
    spaces,
    unpublishedSpaces,
  };
}
