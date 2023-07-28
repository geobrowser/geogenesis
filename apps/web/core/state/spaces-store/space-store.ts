import { ObservableComputed, computed } from '@legendapp/state';

import { AppConfig } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Services } from '~/core/services';
import { Space } from '~/core/types';
import { makeOptionalComputed } from '~/core/utils/utils';

type SpacesAccounts = Record<string, string[]>;

export class SpaceStore {
  private api: Subgraph.ISubgraph;
  spaces$: ObservableComputed<Space[]>;
  admins$: ObservableComputed<SpacesAccounts>;
  editorControllers$: ObservableComputed<SpacesAccounts>;
  editors$: ObservableComputed<SpacesAccounts>;

  constructor({ api, config }: { api: Subgraph.ISubgraph; config: AppConfig }) {
    this.api = api;

    this.spaces$ = makeOptionalComputed(
      [],
      computed(async () => {
        try {
          return await this.api.fetchSpaces({ endpoint: config.subgraph });
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

export function useSpaceStoreInstance() {
  return Services.useServices().spaceStore;
}
