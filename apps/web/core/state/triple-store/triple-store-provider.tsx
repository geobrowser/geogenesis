'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { InitialTripleStoreParams } from './triple-store';

const TripleStoreContext = createContext<{ space: string; initialParams: InitialTripleStoreParams } | undefined>(
  undefined
);

interface Props {
  space: string;
  initialParams: InitialTripleStoreParams;
  children: React.ReactNode;
}

export function TripleStoreProvider({ space, children, initialParams }: Props) {
  const value = useMemo(() => {
    return {
      space,
      initialParams,
    };
  }, [space, initialParams]);

  return <TripleStoreContext.Provider value={value}>{children}</TripleStoreContext.Provider>;
}

export function useTripleStoreInstance() {
  const value = useContext(TripleStoreContext);

  if (!value) {
    throw new Error(`Missing TripleStoreProvider`);
  }

  return value;
}
