'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { OmitStrict, Triple } from '~/core/types';

const EntityStoreContext = createContext<OmitStrict<Props, 'children'> | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialTriples: Triple[];
}

export function EntityStoreProvider({ id, spaceId, children, initialTriples }: Props) {
  const store = useMemo(() => {
    return {
      spaceId,
      initialTriples,
      id,
    };
  }, [spaceId, initialTriples, id]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreInstance() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
