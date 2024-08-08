'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { Relation } from '~/core/io/dto/entities';
import { OmitStrict, Triple } from '~/core/types';

const EntityStoreContext = createContext<OmitStrict<Props, 'children'> | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
  initialRelations: Relation[];
}

export function EntityStoreProvider({ id, spaceId, children, initialTriples, initialRelations }: Props) {
  const store = useMemo(() => {
    return {
      spaceId,
      initialTriples,
      initialRelations,
      id,
    };
  }, [spaceId, initialTriples, initialRelations, id]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreInstance() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
