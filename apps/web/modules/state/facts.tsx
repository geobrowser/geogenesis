import { useSharedObservable } from '~/modules/state/hook';
import { INetwork } from '~/modules/services/network';
import { BehaviorSubject } from 'rxjs';
import { IFact } from '../types';

interface IFactsStoreConfig {
  api: INetwork;
  initialFacts?: IFact[];
}

export class FactsStore {
  api: INetwork;

  // Stores all the local facts that are being tracked. These are added by the user.
  facts$: BehaviorSubject<IFact[]>;

  constructor({ api, initialFacts = [] }: IFactsStoreConfig) {
    this.api = api;
    this.facts$ = new BehaviorSubject(initialFacts);

    // If you want to keep the local facts in sync with the remote facts, you can do this:
    this.api.syncer$.subscribe(value => {
      // Only update state with the union of the local and remote stores
      // state = (local - remote) + remote
      const merged = [...new Set([...this.facts$.getValue(), ...value])];
      this.facts$.next(merged);
    });
  }

  createFact = async (fact: IFact) => {
    // Optimistically add fact to the local store if it doesn't already exist
    const ids = new Set(this.facts$.getValue().map(fact => fact.id));

    if (!ids.has(fact.id)) {
      this.facts$.next([...this.facts$.getValue(), fact]);
      return await this._uploadFact(fact);
    }
  };

  get facts() {
    return this.facts$.getValue();
  }

  private _uploadFact = async (fact: IFact) => {
    return this.api.insertFact(fact);
  };
}
