import { Signer } from 'ethers';
import { BehaviorSubject, Subscription } from 'rxjs';
import { INetwork } from '~/modules/services/network';
import { dedupe } from '../services/sync';
import { Triple } from '../types';

interface ITripleStoreConfig {
  api: INetwork;
  initialtriples?: Triple[];
}

// TODO: Create store interface

export class TripleStore {
  api: INetwork;
  triples$: BehaviorSubject<Triple[]>;
  private tripleIds = new Set<string>();
  private subscriptions: Subscription[] = [];

  constructor({ api, initialtriples = [] }: ITripleStoreConfig) {
    this.api = api;
    this.triples$ = new BehaviorSubject(initialtriples);

    // If you want to keep the local triples in sync with the remote triples, you can do this:
    const syncerSubscription = this.api.syncer$.subscribe(serverTriples => {
      // Only update state with the union of the local and remote stores
      // state = (local - remote) + remote
      const mergedTriples = dedupe(this.triples, serverTriples, this.tripleIds);
      this.triples$.next(mergedTriples);
    });

    // When triples are updated we can precalculate the ids for deduping.
    // Is this faster than calling this.tripleIds.add(triple.id) in the
    // sync subscriber and any mutations to the triples array (i.e., createTriple)?
    const tripleIdSubscription = this.triples$.subscribe(value => {
      this.tripleIds = new Set(value.map(triple => triple.id));
    });

    this.subscriptions.push(syncerSubscription, tripleIdSubscription);
  }

  create = (triple: Triple) => {
    triple.changed = 'created';
    this.triples$.next([triple, ...this.triples]);
  };

  update = (triple: Triple) => {
    const index = this.triples.findIndex(t => t.id === triple.id);
    const triples = this.triples$.getValue();

    triple.changed = 'edited';
    triples[index] = triple;
    this.triples$.next(triples);
  };

  loadNetworkTriples = async () => {
    const networkTriples = await this.api.getNetworkTriples();
    this.triples$.next(networkTriples);
  };

  get triples() {
    return this.triples$.getValue();
  }
}
