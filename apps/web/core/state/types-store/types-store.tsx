'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Space } from '~/core/io/dto/spaces';
import { EntityId } from '~/core/io/schema';
import { GeoType, Triple as ITriple } from '~/core/types';
import { Triples } from '~/core/utils/triples';

interface TypesStoreProviderState {
  initialTypes: ITriple[];
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
  const { relationsOut } = useEntity(space?.spaceConfig.id ?? EntityId(''), {
    relations: space?.spaceConfig.relationsOut ?? [],
    triples: space?.spaceConfig.triples ?? [],
  });

  const { actions } = useActionsStore();

  const localForeignTypes: GeoType[] = React.useMemo(() => {
    if (!space) return [];

    return relationsOut
      .filter(r => r.typeOf.id === SYSTEM_IDS.FOREIGN_TYPES)
      .map(r => {
        return {
          entityId: r.toEntity.id,
          entityName: r.toEntity.name,
          space: space.id,
        };
      });
  }, [space, relationsOut]);

  const types: GeoType[] = React.useMemo(() => {
    if (!space) return [];

    // @TODO(relations)
    const globalActions = actions[space.id] || [];
    const localActions = globalActions.filter(a => {
      return a.attributeId === SYSTEM_IDS.TYPES && a.value.value === SYSTEM_IDS.SCHEMA_TYPE && !a.isDeleted;
    });

    const triplesFromActions = Triples.merge(localActions, initialTypes);
    return [...Triples.withLocalNames(globalActions, triplesFromActions), ...localForeignTypes];
  }, [localForeignTypes, initialTypes, space, actions]);

  return {
    types,
    localForeignTypes,
  };
}
