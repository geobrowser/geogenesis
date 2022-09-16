import { useSharedObservable } from '~/modules/state/hook';
import { IMockApi, MockApi } from '~/modules/services/network';
import { BehaviorSubject } from 'rxjs';
import { IFact } from '../types';

export const data: IFact[] = Array.from({ length: 3 }, (_, index) => {
  return {
    id: index.toString(),
    entityId: index.toString(),
    attribute: 'name',
    value: 'John Doe' + ' ' + index,
  };
});

interface IFactsConfig {
  api: IMockApi;
  initialFacts?: IFact[];
}

// TODO:
// Enable editing attributes and values
// Enable tracking changes to attributes and values and triggering updates
export class Facts {
  api: IMockApi;

  // Stores all the local facts that are being tracked. These are added by the user.
  facts$: BehaviorSubject<IFact[]>;

  constructor({ api, initialFacts = [] }: IFactsConfig) {
    this.api = api;
    this.facts$ = new BehaviorSubject(initialFacts);

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

    console.log(fact);

    if (!ids.has(fact.id)) {
      this.facts$.next([...this.facts$.getValue(), fact]);
      await this._uploadFact(fact);
    }
  };

  get facts() {
    return this.facts$.getValue();
  }

  private _uploadFact = async (fact: IFact) => {
    return this.api.insertFact(fact);
  };
}

const FactsStore = new Facts({ api: new MockApi(), initialFacts: data });

// TODO: Inject FactsStore via context
export const useFacts = () => {
  const snapshot = useSharedObservable(FactsStore.facts$);
  const createFact = (fact: IFact) => FactsStore.createFact(fact);
  return { facts: snapshot, createFact };
};
