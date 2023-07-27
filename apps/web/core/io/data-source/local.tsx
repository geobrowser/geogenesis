'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { ObservableComputed, computed } from '@legendapp/state';
import { Action, ActionsStore, useActionsStoreInstance } from '../../../modules/action';
import { Entity as IEntity, Triple as ITriple } from '../../types';
import { makeOptionalComputed } from '../../utils';
import { pipe } from '@mobily/ts-belt';
import { Triple } from '../../../modules/triple';
import { Entity } from '../../utils/entity';
import { useSelector } from '@legendapp/state/react';

export class LocalStore {
  private store: ActionsStore;
  triples$: ObservableComputed<ITriple[]>;
  triplesByEntityId$: ObservableComputed<Record<string, ITriple[]>>;
  unpublishedTriples$: ObservableComputed<ITriple[]>;
  entities$: ObservableComputed<IEntity[]>;
  unpublishedEntities$: ObservableComputed<IEntity[]>;
  spaces$: ObservableComputed<string[]>;
  unpublishedSpaces$: ObservableComputed<string[]>;

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
  const ActionsStore = useActionsStoreInstance();

  const store = useMemo(() => {
    return new LocalStore({ store: ActionsStore });
  }, [ActionsStore]);

  return <LocalStoreContext.Provider value={store}>{children}</LocalStoreContext.Provider>;
}

export function useLocalStoreInstance() {
  const value = useContext(LocalStoreContext);

  if (!value) {
    throw new Error(`Missing LocalStoreProvider`);
  }

  return value;
}

export function useLocalStore() {
  const {
    entities$,
    triples$,
    spaces$,
    unpublishedEntities$,
    unpublishedSpaces$,
    unpublishedTriples$,
    triplesByEntityId$,
  } = useLocalStoreInstance();

  const entities = useSelector(entities$);
  const triples = useSelector(triples$);
  const triplesByEntityId = useSelector(triplesByEntityId$);
  const unpublishedEntities = useSelector(unpublishedEntities$);
  const unpublishedTriples = useSelector(unpublishedTriples$);
  const spaces = useSelector(spaces$);
  const unpublishedSpaces = useSelector(unpublishedSpaces$);

  return {
    entities,
    triples,
    triplesByEntityId,
    unpublishedEntities,
    unpublishedTriples,
    spaces,
    unpublishedSpaces,
  };
}
