import { BehaviorSubject } from 'rxjs';
import { ITriple } from '~/modules/types';
import { INetwork } from '../network';

export class MockNetwork implements INetwork {
  syncer$ = new BehaviorSubject([]);
  getRemoteFacts = async () => [];
  createTriple = async (triple: ITriple) => triple;
}
