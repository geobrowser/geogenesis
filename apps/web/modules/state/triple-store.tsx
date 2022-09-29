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

  createNetworkTriple = async (triple: Triple, signer: Signer) => {
    const newTriple = await this.api.createTriple(triple, signer);
    const triples = this.triples$.getValue();
    const index = triples.findIndex(t => t.id === triple.id); // triple.id should be '' for new triples
    triples[index] = newTriple;
    this.triples$.next(triples);
    return newTriple;
  };

  updateNetworkTriple = async (triple: Triple, oldTriple: Triple, signer: Signer) => {
    const newTriple = await this.api.updateTriple(triple, oldTriple, signer);
    const index = this.triples.findIndex(t => t.id === oldTriple.id);
    const triples = this.triples$.getValue();
    triples[index] = newTriple;
    this.triples$.next(triples);
  };

  upsertLocalTriple = (triple: Triple) => {
    const index = this.triples.findIndex(t => t.id === triple.id);
    if (index === -1) {
      this.triples$.next([triple, ...this.triples$.getValue()]);
    } else {
      const triples = this.triples$.getValue();
      triples[index] = triple;
      this.triples$.next(triples);
    }
  };

  loadNetworkTriples = async () => {
    const networkTriples = await this.api.getNetworkTriples();
    this.triples$.next(networkTriples);
  };

  get triples() {
    return this.triples$.getValue();
  }
}
