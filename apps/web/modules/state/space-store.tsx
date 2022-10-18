import { INetwork } from '../services/network';

export class SpaceStore {
  private api: INetwork;

  constructor({ api }: { api: INetwork }) {
    this.api = api;
  }

  get spaces$() {
    return this.api.spaces$;
  }
}
