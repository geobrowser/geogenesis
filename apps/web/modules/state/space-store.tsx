import { computed, ObservableComputed } from '@legendapp/state';
import { INetwork } from '../services/network';
import { Space } from '../types';
import { makeOptionalComputed } from '../utils';

export class SpaceStore {
  private api: INetwork;
  spaces$: ObservableComputed<Space[]>;

  constructor({ api }: { api: INetwork }) {
    this.api = api;

    this.spaces$ = makeOptionalComputed(
      [],
      computed(() => this.api.fetchSpaces())
    );
  }
}
