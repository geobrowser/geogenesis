import { computed, ObservableComputed } from '@legendapp/state';
import { Services } from '../services';
import { INetwork } from '../services/network';
import { Space } from '../types';
import { makeOptionalComputed } from '../utils';

type SpacesAccounts = Record<string, string[]>;

export class SpaceStore {
  private api: INetwork;
  spaces$: ObservableComputed<Space[]>;
  admins$: ObservableComputed<SpacesAccounts>;
  editorControllers$: ObservableComputed<SpacesAccounts>;
  editors$: ObservableComputed<SpacesAccounts>;

  constructor({ api }: { api: INetwork }) {
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

export function useSpaceStore() {
  return Services.useServices().spaceStore;
}
