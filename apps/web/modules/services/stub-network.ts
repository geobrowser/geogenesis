import { BehaviorSubject } from 'rxjs';
import { Triple } from '~/modules/types';
import { createTripleId, createTripleWithId } from './create-id';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  syncer$ = new BehaviorSubject([]);
  getNetworkTriples = async () => [];
  createTriple = async (triple: Triple) => createTripleWithId(triple.entityId, triple.attributeId, triple.value);
  updateTriple = async (triple: Triple, oldTriple: Triple) =>
    createTripleWithId(triple.entityId, triple.attributeId, triple.value);
}
