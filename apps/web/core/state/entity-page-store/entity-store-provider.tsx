'use client';

import * as React from 'react';

import { useHydrateEntity } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Entity, OmitStrict } from '~/core/types';

const EntityStoreContext = React.createContext<OmitStrict<Props, 'children' | 'initialEntities'> | undefined>(
  undefined
);

interface Props {
  id: string;
  spaceId: string;
  /**
   * Entities the server already fetched for this page. Seeded into the store during render so the
   * server HTML carries the page and the browser's first render matches it, rather than both
   * drawing nothing until `useHydrateEntity` has fetched the same entity again.
   */
  initialEntities?: Entity[];
  children: React.ReactNode;
}

const subscribeNever = () => () => {};

/**
 * False on the server and during the browser's initial hydration, true for every render after.
 *
 * `useSyncExternalStore` answers from `getServerSnapshot` while hydrating, which is exactly the
 * window in which seeding has to happen during render: earlier than an effect, so the markup
 * matches the server's. After that a page arrives by client navigation into a tree that is
 * already subscribed to the store, and writing to it mid-render would update other components
 * while this one renders.
 */
function useIsPastHydration() {
  return React.useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

export function EntityStoreProvider({ id, spaceId, initialEntities, children }: Props) {
  const { store } = useSyncEngine();
  const isPastHydration = useIsPastHydration();
  const seeded = React.useRef<Entity[] | undefined>(undefined);

  if (!isPastHydration && initialEntities && seeded.current !== initialEntities) {
    seeded.current = initialEntities;
    store.seedFromServer(initialEntities);
  }

  React.useEffect(() => {
    if (initialEntities && seeded.current !== initialEntities) {
      seeded.current = initialEntities;
      store.seedFromServer(initialEntities);
    }
  }, [store, initialEntities]);

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

  const value = React.useMemo(() => {
    return {
      spaceId,
      id,
    };
  }, [spaceId, id]);

  return <EntityStoreContext.Provider value={value}>{children}</EntityStoreContext.Provider>;
}

export function useEntityStoreInstance() {
  const value = React.useContext(EntityStoreContext);

  if (!value) {
    throw new Error(`Missing EntityStoreProvider`);
  }

  return value;
}
