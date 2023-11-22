'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, pipe } from '@mobily/ts-belt';

import * as React from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { GeoType, Space, Triple as TripleType } from '~/core/types';
import { Triple } from '~/core/utils/triple';

import { useLocalStore } from '../local-store';

interface TypesStoreProviderState {
  initialTypes: TripleType[];
  space: Space | null;
}

const TypesStoreContext = React.createContext<TypesStoreProviderState | null>(null);

export function TypesStoreProvider({
  children,
  initialTypes,
  space,
}: TypesStoreProviderState & { children: React.ReactNode }) {
  const value = React.useMemo(() => {
    return {
      initialTypes,
      space,
    };
  }, [initialTypes, space]);

  return <TypesStoreContext.Provider value={value}>{children}</TypesStoreContext.Provider>;
}

export function useTypesStoreInstance() {
  const context = React.useContext(TypesStoreContext);

  if (context === null) {
    throw new Error('Missing TypesStoreProvider');
  }

  return context;
}

export function useTypesStore(): {
  types: GeoType[];
  localForeignTypes: GeoType[];
} {
  const { initialTypes, space } = useTypesStoreInstance();
  const { actions } = useActionsStore();
  const { triples } = useLocalStore();

  const localForeignTypes: GeoType[] = React.useMemo(() => {
    if (!space) return [];

    const triplesFromSpaceActions = triples.filter(t => t.space === space.id);

    const spaceConfigId = space.spaceConfigEntityId;

    if (!spaceConfigId) {
      const localSpaceConfigId = triplesFromSpaceActions.find(
        t => t.value.type === 'entity' && t.value.id === SYSTEM_IDS.SPACE_CONFIGURATION
      )?.entityId;

      const localForeignTriples = pipe(
        triples,
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
      triples,
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
  }, [space, triples]);

  const types: GeoType[] = React.useMemo(() => {
    if (!space) return [];

    const globalActions = actions[space.id] || [];
    const localActions = globalActions.filter(a => {
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

    const triplesFromActions = Triple.fromActions(localActions, initialTypes);
    return [...Triple.withLocalNames(globalActions, triplesFromActions), ...localForeignTypes];
  }, [localForeignTypes, initialTypes, space, actions]);

  return {
    types,
    localForeignTypes,
  };
}
