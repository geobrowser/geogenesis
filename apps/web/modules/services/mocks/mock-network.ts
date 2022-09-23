import { BehaviorSubject } from 'rxjs';
import { Triple } from '~/modules/types';
import { INetwork } from '../network';

export class MockNetwork implements INetwork {
  syncer$ = new BehaviorSubject([]);
  getNetworkTriples = async () => [];
  createTriple = async (triple: Triple) => triple;
}
