import { Signer } from 'ethers';
import { BehaviorSubject, Subscription } from 'rxjs';
import { INetwork } from '~/modules/services/network';
import { createTripleId } from '../services/create-id';
import { dedupe } from '../services/sync';
import { Triple } from '../types';

interface ITripleStoreConfig {
  api: INetwork;
  initialtriples?: Triple[];
}

// TODO: Create store interface
interface ITripleStore {
  triples$: BehaviorSubject<Triple[]>;
  create(triple: Triple): void;
  update(triple: Triple, oldTriple: Triple): void;
  publish(signer: Signer): void;
}

export class TripleStore implements ITripleStore {
  api: INetwork;
  triples$: BehaviorSubject<Triple[]>; // state of the triples as they exist right now
  private changedTriples: Triple[] = []; // state of the triples that have changed
  private tripleIds = new Set<string>();
  private subscriptions: Subscription[] = [];

  constructor({ api, initialtriples = [] }: ITripleStoreConfig) {
    this.api = api;
    this.triples$ = new BehaviorSubject(initialtriples);

    // If you want to keep the local triples in sync with the remote triples, you can do this:
    // const syncerSubscription = this.api.syncer$.subscribe(serverTriples => {
    //   // Only update state with the union of the local and remote stores
    //   // state = (local - remote) + remote
    //   const mergedTriples = dedupe(this.triples, serverTriples, this.tripleIds);
    //   this.triples$.next(mergedTriples);
    // });

    // When triples are updated we can precalculate the ids for deduping.
    // Is this faster than calling this.tripleIds.add(triple.id) in the
    // sync subscriber and any mutations to the triples array (i.e., createTriple)?
    const tripleIdSubscription = this.triples$.subscribe(value => {
      this.tripleIds = new Set(value.map(triple => triple.id));
    });

    // this.subscriptions.push(syncerSubscription, tripleIdSubscription);
  }

  create = (triple: Triple) => {
    triple.status = 'created';
    this.triples$.next([triple, ...this.triples]);
    this.changedTriples.push(triple);
  };

  update = (triple: Triple, oldTriple: Triple) => {
    const index = this.triples.findIndex(t => t.id === oldTriple.id);
    const triples = this.triples$.getValue();

    if (oldTriple.status === 'created') {
      const indexOfChangedTriple = this.changedTriples.findIndex(t => t.id === oldTriple.id);
      triple.status = 'created';
      this.changedTriples[indexOfChangedTriple] = triple;
    } else {
      triple.status = 'edited';
      this.changedTriples.push({
        ...oldTriple,
        status: 'deleted',
      });

      triple.id = createTripleId(triple.entityId, triple.attributeId, triple.value);

      this.changedTriples.push({
        ...triple,
        status: 'created',
      });
      // TODO: Do something with old triple
    }

    triple.id = createTripleId(triple.entityId, triple.attributeId, triple.value);
    triples[index] = triple;
    this.triples$.next(triples);
  };

  publish = (signer: Signer) => {
    console.log('Changed triples', this.changedTriples);
    console.log('State triples', this.triples);
    this.api.publish(this.changedTriples, signer);
    this.changedTriples = [];
    // TODO: Need to clear status from all triples
  };

  loadNetworkTriples = async () => {
    const networkTriples = await this.api.getNetworkTriples();
    this.triples$.next(networkTriples);
  };

  get triples() {
    return this.triples$.getValue();
  }
}
