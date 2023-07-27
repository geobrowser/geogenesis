import { computed, ObservableComputed } from '@legendapp/state';

import { Services } from '../../services';
import { NetworkData } from '~/core/io';
import { Space } from '~/core/types';
import { makeOptionalComputed } from '~/core/utils/utils';

type SpacesAccounts = Record<string, string[]>;

export class SpaceStore {
  private api: NetworkData.INetwork;
  spaces$: ObservableComputed<Space[]>;
  admins$: ObservableComputed<SpacesAccounts>;
  editorControllers$: ObservableComputed<SpacesAccounts>;
  editors$: ObservableComputed<SpacesAccounts>;

  constructor({ api }: { api: NetworkData.INetwork }) {
    this.api = api;

    this.spaces$ = makeOptionalComputed(
      [],
      computed(async () => {
        try {
          return await this.api.fetchSpaces();
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
