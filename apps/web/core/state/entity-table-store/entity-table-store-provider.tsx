'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { useSpaces } from '~/core/hooks/use-spaces';
import { Column, GeoType, OmitStrict, Row, Space } from '~/core/types';

import { InitialEntityTableStoreParams } from './entity-table-store-params';

const EntityTableStoreContext = createContext<(OmitStrict<Props, 'children'> & { space: Space | null }) | undefined>(
  undefined
);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  initialSelectedType: GeoType | null;
  initialParams: InitialEntityTableStoreParams;
  initialColumns: Column[];
  initialRows: Row[];
}

export function EntityTableStoreProvider({
  spaceId,
  children,
  initialSelectedType,
  initialParams,
  initialColumns,
  initialRows,
}: Props) {
  const { spaces } = useSpaces();
  const space = spaces.find(space => space.id === spaceId) ?? null;

  const value = useMemo(() => {
    return {
      spaceId,
      initialSelectedType,
      initialParams,
      initialColumns,
      initialRows,
      space,
    };
  }, [spaceId, initialSelectedType, initialParams, initialColumns, initialRows, space]);

  return <EntityTableStoreContext.Provider value={value}>{children}</EntityTableStoreContext.Provider>;
}

export function useEntityTableStoreInstance() {
  const value = useContext(EntityTableStoreContext);

  if (!value) {
    throw new Error('Missing EntityTableStoreProvider');
  }

  return value;
}
