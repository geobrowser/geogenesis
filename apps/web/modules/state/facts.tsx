import { useSharedObservable } from '~/modules/state/hook';
import { INetwork } from '~/modules/services/network';
import { BehaviorSubject } from 'rxjs';
import { IFact } from '../types';
import { dedupe } from '../services/sync';

interface IFactsStoreConfig {
  api: INetwork;
  initialFacts?: IFact[];
}

export class FactsStore {
  api: INetwork;
  facts$: BehaviorSubject<IFact[]>;
  private tripleIds = new Set<string>();

  constructor({ api, initialFacts = [] }: IFactsStoreConfig) {
    this.api = api;
    this.facts$ = new BehaviorSubject(initialFacts);

    // If you want to keep the local facts in sync with the remote facts, you can do this:
    this.api.syncer$.subscribe(serverTriples => {
      // Only update state with the union of the local and remote stores
      // state = (local - remote) + remote
      const mergedTriples = dedupe(this.facts, serverTriples, this.tripleIds);
      this.facts$.next(mergedTriples);
    });

    // When facts are updated we can precalculate the ids for deduping.
    // Is this faster than adding to this.tripleIds in the sync subscriber
    // and any mutations to the facts array (i.e., createFact)
    this.facts$.subscribe(value => {
      this.tripleIds = new Set(value.map(fact => fact.id));
    });
  }

  createFact = async (fact: IFact) => {
    this.facts$.next([fact, ...this.facts$.getValue()]);
    // return await this._uploadFact(fact);
  };

  get facts() {
    return this.facts$.getValue();
  }

  // private _uploadFact = async (fact: IFact) => {
  //   return this.api.insertFact(fact);
  // };
}
