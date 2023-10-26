import { ObservableComputed, computed } from '@legendapp/state';

import React from 'react';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Services } from '~/core/services';
import { Space } from '~/core/types';
import { makeOptionalComputed } from '~/core/utils/utils';

type SpacesAccounts = Record<string, string[]>;

export class SpaceStore {
  private subgraph: Subgraph.ISubgraph;
  spaces$: ObservableComputed<Space[]>;
  admins$: ObservableComputed<SpacesAccounts>;
  editorControllers$: ObservableComputed<SpacesAccounts>;
  editors$: ObservableComputed<SpacesAccounts>;

  constructor({ subgraph }: { subgraph: Subgraph.ISubgraph }) {
    this.subgraph = subgraph;

    this.spaces$ = makeOptionalComputed(
      [],
      computed(async () => {
        try {
          return await this.subgraph.fetchSpaces({
            endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).subgraph,
          });
        } catch (e) {
          return [];
        }
      })
    );

    this.admins$ = makeOptionalComputed(
      {},
      computed(() => {
        return this.spaces$.get().reduce((admins, space) => {
          admins[space.id] = space.admins;
          return admins;
        }, {} as SpacesAccounts);
      })
    );

    this.editorControllers$ = makeOptionalComputed(
      {},
      computed(() => {
        return this.spaces$.get().reduce((editorControllers, space) => {
          editorControllers[space.id] = space.editorControllers;
          return editorControllers;
        }, {} as SpacesAccounts);
      })
    );

    this.editors$ = makeOptionalComputed(
      {},
      computed(() => {
        return this.spaces$.get().reduce((editors, space) => {
          editors[space.id] = space.editors;
          return editors;
        }, {} as SpacesAccounts);
      })
    );
  }
}

const SpaceStoreContext = React.createContext<SpaceStore | null>(null);

// This is a workaround to provide all stores in an in-memory cache. Once we have
// permissionless spaches this won't be scalable anymore as there could be thousands
// of spaces in different subgraphs and we'll need to rely on merging local data with
// a remote cache (like RQ) instead.
export function SpaceStoreProvider({ children }: { children: React.ReactNode }) {
  const { subgraph } = Services.useServices();
  const spaceStore = React.useMemo(() => {
    return new SpaceStore({ subgraph });
  }, [subgraph]);

  return <SpaceStoreContext.Provider value={spaceStore}>{children}</SpaceStoreContext.Provider>;
}

export function useSpaceStoreInstance() {
  const value = React.useContext(SpaceStoreContext);

  if (!value) {
    throw new Error(`Missing SpaceStoreProvider`);
  }

  return value;
}
