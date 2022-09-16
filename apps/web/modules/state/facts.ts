import { useSharedObservable } from '~/modules/state/hook';
import { INetwork, MockNetwork } from '~/modules/services/network';
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
  api: INetwork;
  initialFacts?: IFact[];
}

export class Facts {
  api: INetwork;

  // Stores all the local facts that are being tracked. These are added by the user.
  facts$: BehaviorSubject<IFact[]>;

  constructor({ api, initialFacts = [] }: IFactsConfig) {
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

const FactsStore = new Facts({ api: new MockNetwork(), initialFacts: data });

// TODO: Inject FactsStore via context
export const useFacts = () => {
  const snapshot = useSharedObservable(FactsStore.facts$);
  const createFact = (fact: IFact) => FactsStore.createFact(fact);
  return { facts: snapshot, createFact };
};

// We create a domain model that lives completely outside of React is in charge of several things:
// 1. Stores the state of local data
// 2. Exposes APIs for manipulating the local data
// 3. Can subscribe to a syncing mechanism to keep local state in sync with remote state
// (class Facts)

// We create a hook that bridges the domain model to React. All this hook does is sync the external
// domain model with the React tree, telling React to update when there are changes. (useSharedObservable)

// We can create usecase-specific hooks that use the generic hook and wrap it with more specific APIs. (useFacts)
