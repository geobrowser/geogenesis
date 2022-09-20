import { INetwork } from '~/modules/services/network';
import { Signer } from 'ethers';
import { BehaviorSubject } from 'rxjs';
import { ITriple } from '../types';
import { dedupe } from '../services/sync';

interface ITripleStoreConfig {
  api: INetwork;
  initialtriples?: ITriple[];
}

export class TripleStore {
  api: INetwork;
  triples$: BehaviorSubject<ITriple[]>;
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

  createTriple = async (triple: ITriple, signer: Signer) => {
    this.triples$.next([triple, ...this.triples$.getValue()]);
    return await this.api.createTriple(triple, signer);
  };

  get triples() {
    return this.triples$.getValue();
  }
}
