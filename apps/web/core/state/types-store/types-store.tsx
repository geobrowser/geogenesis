'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { ObservableComputed, computed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, pipe } from '@mobily/ts-belt';

import * as React from 'react';

import { ActionsStore, useActionsStoreInstance } from '~/core/state/actions-store';
import { GeoType, Space, Triple as TripleType } from '~/core/types';
import { Triple } from '~/core/utils/triple';
import { makeOptionalComputed } from '~/core/utils/utils';

import { LocalStore, useLocalStoreInstance } from '../local-store';

export class TypesStore {
  actions: ActionsStore;
  initialTypes: TripleType[];
  // HACK: Right now the type-dialog is the only place consuming this.types$. It only
  // uses the entityId and entityName, so we filter out the rest of the data when adding
  // a foreign type. This makes it so we don't have to query the network or check local
  // actions for the entity whose entityId === t.value.id
  types$: ObservableComputed<GeoType[]>;
  localForeignTypes$: ObservableComputed<GeoType[]>;

  constructor({
    actions,
    localStore,
    initialTypes,
    space,
  }: {
    actions: ActionsStore;
    localStore: LocalStore;
    initialTypes: TripleType[];
    space: Space | null;
  }) {
    this.actions = actions;
    this.initialTypes = initialTypes;

    this.localForeignTypes$ = makeOptionalComputed(
      [],
      computed(() => {
        if (!space) return [];

        const triplesFromSpaceActions = localStore.triples$.get().filter(t => t.space === space.id);

        const spaceConfigId = space.spaceConfigEntityId;

        if (!spaceConfigId) {
          const localSpaceConfigId = triplesFromSpaceActions.find(
            t => t.value.type === 'entity' && t.value.id === SYSTEM_IDS.SPACE_CONFIGURATION
          )?.entityId;

          const localForeignTriples = pipe(
            localStore.triples$.get(),
            A.filter(t => t.entityId === localSpaceConfigId),
            A.filter(t => t.attributeId === SYSTEM_IDS.FOREIGN_TYPES),
            // HACK: Right now the type-dialog is the only place consuming this.types$. It only
            // uses the entityId and entityName, so we filter out the rest of the data. This
            // makes it so we don't have to query the network or check local actions for the
            // entity whose entityId === t.value.id
            A.map(t => ({
              id: t.id,
              entityId: t.value.type === 'entity' ? t.value.id : '',
              entityName: t.value.type === 'entity' ? (t.value.name ? t.value.name : '') : '', // lol
              space: t.space,
            }))
          );

          return localForeignTriples;
        }

        const localForeignTypes = pipe(
          localStore.triples$.get(),
          A.filter(t => t.entityId === spaceConfigId),
          A.filter(t => t.attributeId === SYSTEM_IDS.FOREIGN_TYPES),
          // HACK: Right now the type-dialog is the only place consuming this.types$. It only
          // uses the entityId and entityName, so we filter out the rest of the data. This
          // makes it so we don't have to query the network or check local actions for the
          // entity whose entityId === t.value.id
          A.map(t => ({
            id: t.id,
            entityId: t.value.type === 'entity' ? t.value.id : '',
            entityName: t.value.type === 'entity' ? (t.value.name ? t.value.name : '') : '', // lol
            space: t.space,
          }))
        );

        return localForeignTypes;
      })
    );

    this.types$ = computed(() => {
      if (!space) return [];

      const globalActions = this.actions.actions$.get()[space.id] || [];
      const actions = globalActions.filter(a => {
        const isCreate =
          a.type === 'createTriple' && a.attributeId === SYSTEM_IDS.TYPES && a.value.id === SYSTEM_IDS.SCHEMA_TYPE;
        const isDelete =
          a.type === 'deleteTriple' && a.attributeId === SYSTEM_IDS.TYPES && a.value.id === SYSTEM_IDS.SCHEMA_TYPE;
        const isRemove =
          a.type === 'editTriple' &&
          a.before.attributeId === SYSTEM_IDS.TYPES &&
          a.before.value.id === SYSTEM_IDS.SCHEMA_TYPE;

        return isCreate || isDelete || isRemove;
      });

      const localForeignTypes = this.localForeignTypes$.get();

      const triplesFromActions = Triple.fromActions(actions, initialTypes);
      return [...Triple.withLocalNames(globalActions, triplesFromActions), ...localForeignTypes];
    });
  }
}

const TypesStoreContext = React.createContext<TypesStore | null>(null);

export function TypesStoreProvider({
  children,
  initialTypes,
  space,
}: {
  children: React.ReactNode;
  initialTypes: TripleType[];
  space: Space | null;
}) {
  const LocalStore = useLocalStoreInstance();
  const ActionsStore = useActionsStoreInstance();

  const typesStore = React.useMemo(() => {
    return new TypesStore({
      actions: ActionsStore,
      localStore: LocalStore,
      initialTypes,
      space,
    });
  }, [ActionsStore, space, initialTypes, LocalStore]);

  return <TypesStoreContext.Provider value={typesStore}>{children}</TypesStoreContext.Provider>;
}

export function useTypesStoreInstance() {
  const context = React.useContext(TypesStoreContext);

  if (context === null) {
    throw new Error('Missing TypesStoreProvider');
  }

  return context;
}

export function useTypesStore() {
  const { types$, localForeignTypes$ } = useTypesStoreInstance();

  const types = useSelector(types$);
  const localForeignTypes = useSelector(localForeignTypes$);

  return {
    types,
    localForeignTypes,
  };
}
