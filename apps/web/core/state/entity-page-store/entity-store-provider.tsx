'use client';

import * as React from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { OmitStrict } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { Entity, Relation, Value } from '~/core/v2.types';

const EntityStoreContext = React.createContext<
  OmitStrict<Props, 'children' | 'initialRelations' | 'initialValues'> | undefined
>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
  initialValues: Value[];
  initialRelations: Relation[];
}

export function EntityStoreProvider({ id, spaceId, children, initialValues, initialRelations }: Props) {
  const { hydrateWith } = useSyncEngine();

  React.useEffect(() => {
    const newEntity: Entity = {
      id,
      name: null,
      description: null,
      types: [],
      spaces: Entities.spaces(initialValues, initialRelations),
      values: initialValues,
      relations: initialRelations,
    };

    hydrateWith([newEntity]);
  }, [id, initialRelations, initialValues, hydrateWith]);

  const store = React.useMemo(() => {
    return {
      spaceId,
      id,
    };
  }, [spaceId, id]);

  return <EntityStoreContext.Provider value={store}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreInstance() {
  const value = React.useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
