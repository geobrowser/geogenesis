'use client';

import * as React from 'react';

import { useHydrateEntity } from '~/core/sync/use-store';
import { OmitStrict } from '~/core/types';

const EntityStoreContext = React.createContext<OmitStrict<Props, 'children'> | undefined>(undefined);

interface Props {
  id: string;
  spaceId: string;
  children: React.ReactNode;
}

export function EntityStoreProvider({ id, spaceId, children }: Props) {
  /**
   * We hydrate the entity in the provider to ensure that all downstream
   * consumers of entity data are guaranteed to be able to query for the
   * entity. We trigger it here instead of in another component to ensure
   * the hydration is triggered as early/high as possible in the component
   * tree.
   */
  useHydrateEntity({
    id,
  });

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
