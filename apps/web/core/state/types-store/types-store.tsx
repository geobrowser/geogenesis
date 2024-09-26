'use client';

import { SYSTEM_IDS } from '@geobrowser/gdk';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { useTriples } from '~/core/database/triples';
import { Space } from '~/core/io/dto/spaces';
import { EntityId } from '~/core/io/schema';
import { GeoType, Triple as ITriple } from '~/core/types';

interface TypesStoreProviderState {
  // @TODO(relations) initial types should be relations and not triples
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

  // @TODO(relations)
  const types = useTriples(
    React.useMemo(() => {
      return {
        mergeWith: initialTypes,
        selector: t => t.attributeId === SYSTEM_IDS.TYPES && t.value.value === SYSTEM_IDS.SCHEMA_TYPE,
      };
    }, [initialTypes])
  );

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

  return {
    types,
    localForeignTypes,
  };
}
