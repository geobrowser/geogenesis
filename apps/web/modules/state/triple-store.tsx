import { Signer } from 'ethers';
import { BehaviorSubject } from 'rxjs';
import { INetwork } from '~/modules/services/network';
import { dedupe } from '../services/sync';
import { Triple } from '../types';

interface ITripleStoreConfig {
  api: INetwork;
  initialtriples?: Triple[];
}

export class TripleStore {
  api: INetwork;
  triples$: BehaviorSubject<Triple[]>;
  private tripleIds = new Set<string>();

  constructor({ api, initialtriples = [] }: ITripleStoreConfig) {
    this.api = api;
    this.triples$ = new BehaviorSubject(initialtriples);

    // If you want to keep the local triples in sync with the remote triples, you can do this:
    this.api.syncer$.subscribe(serverTriples => {
      // Only update state with the union of the local and remote stores
      // state = (local - remote) + remote
      const mergedTriples = dedupe(this.triples, serverTriples, this.tripleIds);
      this.triples$.next(mergedTriples);
    });

    // When triples are updated we can precalculate the ids for deduping.
    // Is this faster than calling this.tripleIds.add(triple.id) in the
    // sync subscriber and any mutations to the triples array (i.e., createTriple)?
    this.triples$.subscribe(value => {
      this.tripleIds = new Set(value.map(triple => triple.id));
    });
  }

  createLocalTriple = (triple: Triple) => this.triples$.next([triple, ...this.triples$.getValue()]);

  createNetworkTriple = async (tripleId: string, signer: Signer) => {
    const triple = this.triples.find(triple => triple.id === tripleId);
    if (!triple) throw new Error(`Triple with id ${tripleId} not found`);
    return await this.api.createTriple(triple, signer);
  };

  // TODO: Should this live in the store or should the triples be passed in?
  loadNetworkTriples = async () => {
    const networkTriples = await this.api.getNetworkTriples();
    this.triples$.next(networkTriples);
  };

  setTriples = (triples: Triple[]) => {
    this.triples$.next(triples);
  };

  get triples() {
    return this.triples$.getValue();
  }
}
