'use client';

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';

import { OmitStrict, SpaceId } from '~/core/types';
import { Relation, Value } from '~/core/v2.types';

const EntityStoreContext = createContext<OmitStrict<Props, 'children'> | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialSpaces: SpaceId[];
  initialValues: Value[];
  initialRelations: Relation[];
}

export function EntityStoreProvider({ id, spaceId, children, initialSpaces, initialValues, initialRelations }: Props) {
  const store = useMemo(() => {
    return {
      spaceId,
      initialSpaces,
      initialValues,
      initialRelations,
      id,
    };
  }, [spaceId, initialSpaces, initialValues, initialRelations, id]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreInstance() {
  const value = useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
